from typing import Any

import orjson

from zerver.lib.test_classes import ZulipTestCase
from zerver.models import Message
from zerver.models.personas import UserPersona
from zerver.models.realms import get_realm
from zerver.models.streams import get_stream


class PersonaTest(ZulipTestCase):
    def create_persona(self, **extras: Any) -> dict[str, Any]:
        """Helper to create a persona via API"""
        persona_info: dict[str, Any] = {
            "name": "Test Character",
            "bio": "A test character for testing",
        }
        persona_info.update(extras)
        result = self.client_post("/json/users/me/personas", persona_info)
        return self.assert_json_success(result)

    def test_create_persona(self) -> None:
        """Test creating a persona via API"""
        self.login("hamlet")
        result = self.create_persona(name="Gandalf the Grey")

        self.assertIn("persona", result)
        persona = result["persona"]
        self.assertEqual(persona["name"], "Gandalf the Grey")
        self.assertTrue(persona["is_active"])
        self.assertIsNotNone(persona["id"])

    def test_create_persona_with_all_fields(self) -> None:
        """Test creating a persona with avatar, color, and bio"""
        self.login("hamlet")
        result = self.create_persona(
            name="Thorin Oakenshield",
            avatar_url="https://example.com/thorin.png",
            color="#1a5276",
            bio="King under the mountain",
        )

        persona = result["persona"]
        self.assertEqual(persona["name"], "Thorin Oakenshield")
        self.assertEqual(persona["avatar_url"], "https://example.com/thorin.png")
        self.assertEqual(persona["color"], "#1a5276")
        self.assertEqual(persona["bio"], "King under the mountain")

    def test_create_duplicate_persona_name(self) -> None:
        """Test that duplicate persona names are rejected"""
        self.login("hamlet")
        self.create_persona(name="Gandalf")

        result = self.client_post(
            "/json/users/me/personas",
            {"name": "Gandalf", "bio": "Another Gandalf"},
        )
        self.assert_json_error(result, "You already have a persona with this name.")

    def test_persona_limit(self) -> None:
        """Test that users cannot exceed MAX_PERSONAS_PER_USER"""
        self.login("hamlet")

        # Create max personas
        for i in range(UserPersona.MAX_PERSONAS_PER_USER):
            self.create_persona(name=f"Character {i}")

        # Try to create one more
        result = self.client_post(
            "/json/users/me/personas",
            {"name": "One Too Many", "bio": "Should fail"},
        )
        self.assert_json_error(
            result, f"You have reached the maximum number of personas ({UserPersona.MAX_PERSONAS_PER_USER})."
        )

    def test_get_personas(self) -> None:
        """Test listing user's personas"""
        self.login("hamlet")
        self.create_persona(name="Character 1")
        self.create_persona(name="Character 2")

        result = self.client_get("/json/users/me/personas")
        response = self.assert_json_success(result)

        self.assertIn("personas", response)
        self.assertEqual(len(response["personas"]), 2)
        names = {p["name"] for p in response["personas"]}
        self.assertEqual(names, {"Character 1", "Character 2"})

    def test_update_persona(self) -> None:
        """Test updating a persona"""
        self.login("hamlet")
        result = self.create_persona(name="Original Name")
        persona_id = result["persona"]["id"]

        update_result = self.client_patch(
            f"/json/users/me/personas/{persona_id}",
            {"name": "Updated Name", "color": "#e74c3c"},
        )
        response = self.assert_json_success(update_result)

        self.assertEqual(response["persona"]["name"], "Updated Name")
        self.assertEqual(response["persona"]["color"], "#e74c3c")

    def test_update_other_users_persona(self) -> None:
        """Test that users cannot update other users' personas"""
        self.login("hamlet")
        result = self.create_persona(name="Hamlet's Character")
        persona_id = result["persona"]["id"]

        # Login as different user
        self.login("cordelia")
        update_result = self.client_patch(
            f"/json/users/me/personas/{persona_id}",
            {"name": "Stolen Character"},
        )
        self.assert_json_error(update_result, "Persona does not exist.", status_code=404)

    def test_delete_persona(self) -> None:
        """Test soft-deleting a persona"""
        self.login("hamlet")
        result = self.create_persona(name="Temporary Character")
        persona_id = result["persona"]["id"]

        delete_result = self.client_delete(f"/json/users/me/personas/{persona_id}")
        self.assert_json_success(delete_result)

        # Verify persona is soft-deleted (is_active=False)
        persona = UserPersona.objects.get(id=persona_id)
        self.assertFalse(persona.is_active)

        # Verify it's not in the list anymore
        list_result = self.client_get("/json/users/me/personas")
        response = self.assert_json_success(list_result)
        self.assertEqual(len(response["personas"]), 0)

    def test_get_realm_personas(self) -> None:
        """Test listing all personas in the realm (for typeahead)"""
        # Create personas for multiple users
        self.login("hamlet")
        self.create_persona(name="Hamlet's Character")

        self.login("cordelia")
        self.create_persona(name="Cordelia's Character")

        result = self.client_get("/json/realm/personas")
        response = self.assert_json_success(result)

        self.assertIn("personas", response)
        self.assertEqual(len(response["personas"]), 2)

        # Verify each persona includes user info for disambiguation
        for persona in response["personas"]:
            self.assertIn("user_id", persona)
            self.assertIn("user_full_name", persona)


class PersonaMessageTest(ZulipTestCase):
    def test_send_message_as_persona(self) -> None:
        """Test sending a message as a persona"""
        self.login("hamlet")

        # Create a persona
        result = self.client_post(
            "/json/users/me/personas",
            {"name": "Aragorn", "color": "#2e86ab"},
        )
        persona = self.assert_json_success(result)["persona"]
        persona_id = persona["id"]

        # Send a message as the persona
        hamlet = self.example_user("hamlet")
        realm = get_realm("zulip")
        stream = get_stream("Verona", realm)

        msg_result = self.client_post(
            "/json/messages",
            {
                "type": "stream",
                "to": orjson.dumps(stream.name).decode(),
                "topic": "Persona Test",
                "content": "I am Aragorn, son of Arathorn!",
                "persona_id": persona_id,
            },
        )
        response = self.assert_json_success(msg_result)

        # Verify message has persona info
        message = Message.objects.get(id=response["id"])
        self.assertEqual(message.persona_id, persona_id)
        self.assertEqual(message.persona_display_name, "Aragorn")
        self.assertEqual(message.persona_color, "#2e86ab")
        # Real sender is still hamlet
        self.assertEqual(message.sender_id, hamlet.id)

    def test_send_message_with_inactive_persona(self) -> None:
        """Test that sending a message with a deleted persona fails"""
        self.login("hamlet")

        # Create and delete a persona
        result = self.client_post(
            "/json/users/me/personas",
            {"name": "Temporary", "bio": "Will be deleted"},
        )
        persona_id = self.assert_json_success(result)["persona"]["id"]
        self.client_delete(f"/json/users/me/personas/{persona_id}")

        # Try to send a message with the deleted persona
        realm = get_realm("zulip")
        stream = get_stream("Verona", realm)

        msg_result = self.client_post(
            "/json/messages",
            {
                "type": "stream",
                "to": orjson.dumps(stream.name).decode(),
                "topic": "Test",
                "content": "This should fail",
                "persona_id": persona_id,
            },
        )
        self.assert_json_error(msg_result, "Invalid persona ID")

    def test_send_message_with_others_persona(self) -> None:
        """Test that sending a message with another user's persona fails"""
        # Create a persona as hamlet
        self.login("hamlet")
        result = self.client_post(
            "/json/users/me/personas",
            {"name": "Hamlet's Character"},
        )
        persona_id = self.assert_json_success(result)["persona"]["id"]

        # Try to use it as cordelia
        self.login("cordelia")
        realm = get_realm("zulip")
        stream = get_stream("Verona", realm)

        msg_result = self.client_post(
            "/json/messages",
            {
                "type": "stream",
                "to": orjson.dumps(stream.name).decode(),
                "topic": "Test",
                "content": "Stealing persona",
                "persona_id": persona_id,
            },
        )
        self.assert_json_error(msg_result, "Invalid persona ID")


class PersonaMentionTest(ZulipTestCase):
    def test_persona_in_typeahead(self) -> None:
        """Test that personas appear in realm personas endpoint"""
        self.login("hamlet")
        self.client_post("/json/users/me/personas", {"name": "Legolas"})

        self.login("cordelia")
        result = self.client_get("/json/realm/personas")
        response = self.assert_json_success(result)

        names = [p["name"] for p in response["personas"]]
        self.assertIn("Legolas", names)


class PersonaEventTest(ZulipTestCase):
    def test_persona_create_event(self) -> None:
        """Test that creating a persona sends an event"""
        self.login("hamlet")

        with self.capture_send_event_calls(expected_num_events=1) as events:
            self.client_post(
                "/json/users/me/personas",
                {"name": "Event Test Character"},
            )

        event = events[0]["event"]
        self.assertEqual(event["type"], "user_persona")
        self.assertEqual(event["op"], "add")
        self.assertEqual(event["persona"]["name"], "Event Test Character")

    def test_persona_update_event(self) -> None:
        """Test that updating a persona sends an event"""
        self.login("hamlet")
        result = self.client_post(
            "/json/users/me/personas",
            {"name": "Original"},
        )
        persona_id = self.assert_json_success(result)["persona"]["id"]

        with self.capture_send_event_calls(expected_num_events=1) as events:
            self.client_patch(
                f"/json/users/me/personas/{persona_id}",
                {"name": "Updated"},
            )

        event = events[0]["event"]
        self.assertEqual(event["type"], "user_persona")
        self.assertEqual(event["op"], "update")
        self.assertEqual(event["persona"]["name"], "Updated")

    def test_persona_delete_event(self) -> None:
        """Test that deleting a persona sends an event"""
        self.login("hamlet")
        result = self.client_post(
            "/json/users/me/personas",
            {"name": "To Delete"},
        )
        persona_id = self.assert_json_success(result)["persona"]["id"]

        with self.capture_send_event_calls(expected_num_events=1) as events:
            self.client_delete(f"/json/users/me/personas/{persona_id}")

        event = events[0]["event"]
        self.assertEqual(event["type"], "user_persona")
        self.assertEqual(event["op"], "remove")
        self.assertEqual(event["persona_id"], persona_id)
