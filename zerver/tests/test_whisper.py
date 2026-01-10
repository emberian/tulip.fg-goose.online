import orjson

from zerver.actions.user_groups import bulk_add_members_to_user_groups, check_add_user_group
from zerver.lib.test_classes import ZulipTestCase
from zerver.models import Message, Recipient, UserMessage, UserProfile
from zerver.models.streams import get_stream


class WhisperMessageTest(ZulipTestCase):
    """Tests for whispered messages - messages with visibility restricted to specific users/groups."""

    def test_send_whisper_to_user(self) -> None:
        """Test sending a whispered message to a specific user."""
        sender = self.example_user("hamlet")
        recipient = self.example_user("cordelia")
        other_user = self.example_user("othello")

        # All users should be subscribed to the stream
        stream_name = "Verona"
        self.subscribe(sender, stream_name)
        self.subscribe(recipient, stream_name)
        self.subscribe(other_user, stream_name)

        self.login_user(sender)
        result = self.client_post(
            "/json/messages",
            {
                "type": "stream",
                "to": orjson.dumps(stream_name).decode(),
                "content": "This is a whispered message",
                "topic": "whisper test",
                "whisper_to_user_ids": orjson.dumps([recipient.id]).decode(),
            },
        )
        self.assert_json_success(result)
        message_id = orjson.loads(result.content)["id"]

        # Sender should have UserMessage
        self.assertTrue(
            UserMessage.objects.filter(user_profile=sender, message_id=message_id).exists()
        )

        # Recipient should have UserMessage
        self.assertTrue(
            UserMessage.objects.filter(user_profile=recipient, message_id=message_id).exists()
        )

        # Other user should NOT have UserMessage
        self.assertFalse(
            UserMessage.objects.filter(user_profile=other_user, message_id=message_id).exists()
        )

    def test_send_whisper_to_multiple_users(self) -> None:
        """Test sending a whispered message to multiple users."""
        sender = self.example_user("hamlet")
        recipient1 = self.example_user("cordelia")
        recipient2 = self.example_user("iago")
        other_user = self.example_user("othello")

        stream_name = "Verona"
        for user in [sender, recipient1, recipient2, other_user]:
            self.subscribe(user, stream_name)

        self.login_user(sender)
        result = self.client_post(
            "/json/messages",
            {
                "type": "stream",
                "to": orjson.dumps(stream_name).decode(),
                "content": "Whisper to multiple users",
                "topic": "whisper test",
                "whisper_to_user_ids": orjson.dumps([recipient1.id, recipient2.id]).decode(),
            },
        )
        self.assert_json_success(result)
        message_id = orjson.loads(result.content)["id"]

        # Sender and both recipients should have UserMessage
        for user in [sender, recipient1, recipient2]:
            self.assertTrue(
                UserMessage.objects.filter(user_profile=user, message_id=message_id).exists(),
                f"{user.email} should have received the whisper",
            )

        # Other user should NOT have UserMessage
        self.assertFalse(
            UserMessage.objects.filter(user_profile=other_user, message_id=message_id).exists()
        )

    def test_send_whisper_to_group(self) -> None:
        """Test sending a whispered message to a user group."""
        sender = self.example_user("hamlet")
        member1 = self.example_user("cordelia")
        member2 = self.example_user("iago")
        non_member = self.example_user("othello")

        stream_name = "Verona"
        for user in [sender, member1, member2, non_member]:
            self.subscribe(user, stream_name)

        # Create a user group with member1 and member2
        realm = sender.realm
        user_group = check_add_user_group(
            realm, "whisper_test_group", [member1, member2], acting_user=sender
        )

        self.login_user(sender)
        result = self.client_post(
            "/json/messages",
            {
                "type": "stream",
                "to": orjson.dumps(stream_name).decode(),
                "content": "Whisper to a group",
                "topic": "whisper test",
                "whisper_to_group_ids": orjson.dumps([user_group.id]).decode(),
            },
        )
        self.assert_json_success(result)
        message_id = orjson.loads(result.content)["id"]

        # Sender and group members should have UserMessage
        for user in [sender, member1, member2]:
            self.assertTrue(
                UserMessage.objects.filter(user_profile=user, message_id=message_id).exists(),
                f"{user.email} should have received the whisper",
            )

        # Non-member should NOT have UserMessage
        self.assertFalse(
            UserMessage.objects.filter(user_profile=non_member, message_id=message_id).exists()
        )

    def test_send_whisper_to_users_and_groups(self) -> None:
        """Test sending a whispered message to both users and groups."""
        sender = self.example_user("hamlet")
        direct_recipient = self.example_user("cordelia")
        group_member = self.example_user("iago")
        non_recipient = self.example_user("othello")

        stream_name = "Verona"
        for user in [sender, direct_recipient, group_member, non_recipient]:
            self.subscribe(user, stream_name)

        # Create a user group with group_member
        realm = sender.realm
        user_group = check_add_user_group(
            realm, "whisper_combo_group", [group_member], acting_user=sender
        )

        self.login_user(sender)
        result = self.client_post(
            "/json/messages",
            {
                "type": "stream",
                "to": orjson.dumps(stream_name).decode(),
                "content": "Whisper to users and groups",
                "topic": "whisper test",
                "whisper_to_user_ids": orjson.dumps([direct_recipient.id]).decode(),
                "whisper_to_group_ids": orjson.dumps([user_group.id]).decode(),
            },
        )
        self.assert_json_success(result)
        message_id = orjson.loads(result.content)["id"]

        # Sender, direct recipient, and group member should have UserMessage
        for user in [sender, direct_recipient, group_member]:
            self.assertTrue(
                UserMessage.objects.filter(user_profile=user, message_id=message_id).exists(),
                f"{user.email} should have received the whisper",
            )

        # Non-recipient should NOT have UserMessage
        self.assertFalse(
            UserMessage.objects.filter(user_profile=non_recipient, message_id=message_id).exists()
        )

    def test_whisper_metadata_in_message(self) -> None:
        """Test that whisper_recipients is stored in the message."""
        sender = self.example_user("hamlet")
        recipient = self.example_user("cordelia")

        stream_name = "Verona"
        self.subscribe(sender, stream_name)
        self.subscribe(recipient, stream_name)

        self.login_user(sender)
        result = self.client_post(
            "/json/messages",
            {
                "type": "stream",
                "to": orjson.dumps(stream_name).decode(),
                "content": "Whisper with metadata check",
                "topic": "whisper test",
                "whisper_to_user_ids": orjson.dumps([recipient.id]).decode(),
            },
        )
        self.assert_json_success(result)
        message_id = orjson.loads(result.content)["id"]

        message = Message.objects.get(id=message_id)
        assert message.whisper_recipients is not None
        self.assertIn("user_ids", message.whisper_recipients)
        self.assertEqual(message.whisper_recipients["user_ids"], [recipient.id])

    def test_sender_always_receives_own_whisper(self) -> None:
        """Test that the sender always receives their own whispered message,
        even if they're not in the whisper recipient list."""
        sender = self.example_user("hamlet")
        recipient = self.example_user("cordelia")

        stream_name = "Verona"
        self.subscribe(sender, stream_name)
        self.subscribe(recipient, stream_name)

        self.login_user(sender)
        result = self.client_post(
            "/json/messages",
            {
                "type": "stream",
                "to": orjson.dumps(stream_name).decode(),
                "content": "Sender should see this",
                "topic": "whisper test",
                "whisper_to_user_ids": orjson.dumps([recipient.id]).decode(),
            },
        )
        self.assert_json_success(result)
        message_id = orjson.loads(result.content)["id"]

        # Sender should have UserMessage even though not in recipient list
        self.assertTrue(
            UserMessage.objects.filter(user_profile=sender, message_id=message_id).exists()
        )

    def test_whisper_not_allowed_for_dm(self) -> None:
        """Test that whisper parameters cause an error for direct messages."""
        sender = self.example_user("hamlet")
        dm_recipient = self.example_user("cordelia")
        whisper_recipient = self.example_user("othello")

        self.login_user(sender)
        result = self.client_post(
            "/json/messages",
            {
                "type": "private",
                "to": orjson.dumps([dm_recipient.id]).decode(),
                "content": "This is a DM, whisper should cause error",
                "whisper_to_user_ids": orjson.dumps([whisper_recipient.id]).decode(),
            },
        )
        self.assert_json_error(result, "Whispers can only be sent in channels")


class WhisperAccessTest(ZulipTestCase):
    """Tests for access control on whispered messages."""

    def test_non_recipient_cannot_access_whisper(self) -> None:
        """Test that users not in the whisper recipient list cannot access the message."""
        sender = self.example_user("hamlet")
        recipient = self.example_user("cordelia")
        non_recipient = self.example_user("othello")

        stream_name = "Verona"
        for user in [sender, recipient, non_recipient]:
            self.subscribe(user, stream_name)

        self.login_user(sender)
        result = self.client_post(
            "/json/messages",
            {
                "type": "stream",
                "to": orjson.dumps(stream_name).decode(),
                "content": "Secret whisper",
                "topic": "whisper test",
                "whisper_to_user_ids": orjson.dumps([recipient.id]).decode(),
            },
        )
        self.assert_json_success(result)
        message_id = orjson.loads(result.content)["id"]

        # Recipient can access the message
        self.login_user(recipient)
        result = self.client_get(f"/json/messages/{message_id}")
        self.assert_json_success(result)

        # Non-recipient cannot access the message
        self.login_user(non_recipient)
        result = self.client_get(f"/json/messages/{message_id}")
        self.assert_json_error(result, "Invalid message(s)")

    def test_whisper_filtered_from_narrow(self) -> None:
        """Test that whispered messages are filtered from narrows for non-recipients."""
        sender = self.example_user("hamlet")
        recipient = self.example_user("cordelia")
        non_recipient = self.example_user("othello")

        stream_name = "Verona"
        for user in [sender, recipient, non_recipient]:
            self.subscribe(user, stream_name)

        # Send a regular message
        self.login_user(sender)
        result = self.client_post(
            "/json/messages",
            {
                "type": "stream",
                "to": orjson.dumps(stream_name).decode(),
                "content": "Public message",
                "topic": "whisper test",
            },
        )
        self.assert_json_success(result)
        public_message_id = orjson.loads(result.content)["id"]

        # Send a whispered message
        result = self.client_post(
            "/json/messages",
            {
                "type": "stream",
                "to": orjson.dumps(stream_name).decode(),
                "content": "Whispered message",
                "topic": "whisper test",
                "whisper_to_user_ids": orjson.dumps([recipient.id]).decode(),
            },
        )
        self.assert_json_success(result)
        whisper_message_id = orjson.loads(result.content)["id"]

        # Verify sender has UserMessage for the whisper
        self.assertTrue(
            UserMessage.objects.filter(user_profile=sender, message_id=whisper_message_id).exists(),
            f"Sender should have UserMessage for whisper {whisper_message_id}",
        )

        # Sender should see both messages (sender always sees their whispers)
        narrow = orjson.dumps([{"operator": "channel", "operand": stream_name}]).decode()
        result = self.client_get(
            "/json/messages",
            {"narrow": narrow, "num_before": 0, "num_after": 10, "anchor": "oldest"},
        )
        self.assert_json_success(result)
        messages = orjson.loads(result.content)["messages"]
        message_ids = [m["id"] for m in messages]
        self.assertIn(
            public_message_id,
            message_ids,
            f"Public message {public_message_id} not in {message_ids}",
        )
        self.assertIn(
            whisper_message_id,
            message_ids,
            f"Whisper message {whisper_message_id} not in {message_ids}",
        )

        # Recipient should see both messages
        self.login_user(recipient)
        result = self.client_get(
            "/json/messages",
            {"narrow": narrow, "num_before": 0, "num_after": 10, "anchor": "oldest"},
        )
        self.assert_json_success(result)
        messages = orjson.loads(result.content)["messages"]
        message_ids = [m["id"] for m in messages]
        self.assertIn(public_message_id, message_ids)
        self.assertIn(whisper_message_id, message_ids)

        # Non-recipient should only see public message
        self.login_user(non_recipient)
        result = self.client_get(
            "/json/messages",
            {"narrow": narrow, "num_before": 0, "num_after": 10, "anchor": "oldest"},
        )
        self.assert_json_success(result)
        messages = orjson.loads(result.content)["messages"]
        message_ids = [m["id"] for m in messages]
        self.assertIn(public_message_id, message_ids)
        self.assertNotIn(whisper_message_id, message_ids)


class WhisperGroupDynamicAccessTest(ZulipTestCase):
    """Tests for dynamic group membership affecting whisper visibility."""

    def test_adding_user_to_group_grants_whisper_access(self) -> None:
        """Test that adding a user to a group grants them access to past whispers to that group."""
        sender = self.example_user("hamlet")
        existing_member = self.example_user("cordelia")
        new_member = self.example_user("othello")

        stream_name = "Verona"
        for user in [sender, existing_member, new_member]:
            self.subscribe(user, stream_name)

        # Create a user group with only existing_member
        realm = sender.realm
        user_group = check_add_user_group(
            realm, "dynamic_access_group", [existing_member], acting_user=sender
        )

        # Send a whisper to the group
        self.login_user(sender)
        result = self.client_post(
            "/json/messages",
            {
                "type": "stream",
                "to": orjson.dumps(stream_name).decode(),
                "content": "Whisper to group before new member joins",
                "topic": "whisper test",
                "whisper_to_group_ids": orjson.dumps([user_group.id]).decode(),
            },
        )
        self.assert_json_success(result)
        message_id = orjson.loads(result.content)["id"]

        # New member cannot access the message yet
        self.login_user(new_member)
        result = self.client_get(f"/json/messages/{message_id}")
        self.assert_json_error(result, "Invalid message(s)")

        # Add new_member to the group
        bulk_add_members_to_user_groups([user_group], [new_member.id], acting_user=sender)

        # Now new_member can access the message
        result = self.client_get(f"/json/messages/{message_id}")
        self.assert_json_success(result)


class WhisperToPuppetTest(ZulipTestCase):
    """Tests for whispered messages to puppets."""

    def test_send_whisper_to_puppet_with_claimed_handler(self) -> None:
        """Test that whisper to puppet reaches claimed handler."""
        from zerver.actions.stream_puppets import claim_puppet
        from zerver.models.streams import StreamPuppet

        sender = self.example_user("hamlet")
        handler = self.example_user("cordelia")
        non_handler = self.example_user("othello")

        stream_name = "Verona"
        for user in [sender, handler, non_handler]:
            self.subscribe(user, stream_name)

        stream = get_stream(stream_name, sender.realm)
        stream.enable_puppet_mode = True
        stream.save()

        # Create a puppet and claim it
        puppet = StreamPuppet.objects.create(
            stream=stream,
            name="Gandalf",
            avatar_url="https://example.com/gandalf.png",
            created_by=sender,
            visibility_mode=StreamPuppet.VISIBILITY_CLAIMED,
        )
        claim_puppet(puppet, handler)

        # Send whisper to the puppet
        self.login_user(sender)
        result = self.client_post(
            "/json/messages",
            {
                "type": "stream",
                "to": orjson.dumps(stream_name).decode(),
                "content": "Secret message for Gandalf",
                "topic": "whisper test",
                "whisper_to_puppet_ids": orjson.dumps([puppet.id]).decode(),
            },
        )
        self.assert_json_success(result)
        message_id = orjson.loads(result.content)["id"]

        # Sender should have UserMessage
        self.assertTrue(
            UserMessage.objects.filter(user_profile=sender, message_id=message_id).exists()
        )

        # Handler should have UserMessage
        self.assertTrue(
            UserMessage.objects.filter(user_profile=handler, message_id=message_id).exists()
        )

        # Non-handler should NOT have UserMessage
        self.assertFalse(
            UserMessage.objects.filter(user_profile=non_handler, message_id=message_id).exists()
        )

    def test_send_whisper_to_open_puppet_recent_handler(self) -> None:
        """Test that whisper to open puppet reaches recent handlers."""
        from zerver.models.streams import PuppetHandler, StreamPuppet

        sender = self.example_user("hamlet")
        recent_user = self.example_user("cordelia")
        non_recent = self.example_user("othello")

        stream_name = "Verona"
        for user in [sender, recent_user, non_recent]:
            self.subscribe(user, stream_name)

        stream = get_stream(stream_name, sender.realm)
        stream.enable_puppet_mode = True
        stream.save()

        # Create an open puppet
        puppet = StreamPuppet.objects.create(
            stream=stream,
            name="Gandalf",
            created_by=sender,
            visibility_mode=StreamPuppet.VISIBILITY_OPEN,
            recent_handler_window_hours=24,
        )

        # Create a recent handler (simulating recent activity)
        PuppetHandler.objects.create(
            puppet=puppet,
            handler=recent_user,
            handler_type=PuppetHandler.HANDLER_TYPE_RECENT,
        )

        # Send whisper to the puppet
        self.login_user(sender)
        result = self.client_post(
            "/json/messages",
            {
                "type": "stream",
                "to": orjson.dumps(stream_name).decode(),
                "content": "Secret message for Gandalf",
                "topic": "whisper test",
                "whisper_to_puppet_ids": orjson.dumps([puppet.id]).decode(),
            },
        )
        self.assert_json_success(result)
        message_id = orjson.loads(result.content)["id"]

        # Recent handler should have UserMessage
        self.assertTrue(
            UserMessage.objects.filter(user_profile=recent_user, message_id=message_id).exists()
        )

        # Non-recent user should NOT have UserMessage
        self.assertFalse(
            UserMessage.objects.filter(user_profile=non_recent, message_id=message_id).exists()
        )

    def test_whisper_to_puppet_metadata_stored(self) -> None:
        """Test that puppet_ids are stored in whisper_recipients."""
        from zerver.actions.stream_puppets import claim_puppet
        from zerver.models.streams import StreamPuppet

        sender = self.example_user("hamlet")
        handler = self.example_user("cordelia")

        stream_name = "Verona"
        for user in [sender, handler]:
            self.subscribe(user, stream_name)

        stream = get_stream(stream_name, sender.realm)
        stream.enable_puppet_mode = True
        stream.save()

        puppet = StreamPuppet.objects.create(
            stream=stream,
            name="Gandalf",
            created_by=sender,
            visibility_mode=StreamPuppet.VISIBILITY_CLAIMED,
        )
        claim_puppet(puppet, handler)

        self.login_user(sender)
        result = self.client_post(
            "/json/messages",
            {
                "type": "stream",
                "to": orjson.dumps(stream_name).decode(),
                "content": "Whisper with puppet metadata",
                "topic": "whisper test",
                "whisper_to_puppet_ids": orjson.dumps([puppet.id]).decode(),
            },
        )
        self.assert_json_success(result)
        message_id = orjson.loads(result.content)["id"]

        message = Message.objects.get(id=message_id)
        assert message.whisper_recipients is not None
        self.assertIn("puppet_ids", message.whisper_recipients)
        self.assertEqual(message.whisper_recipients["puppet_ids"], [puppet.id])

    def test_whisper_to_users_groups_and_puppets(self) -> None:
        """Test sending a whisper to users, groups, and puppets simultaneously."""
        from zerver.actions.stream_puppets import claim_puppet
        from zerver.models.streams import StreamPuppet

        sender = self.example_user("hamlet")
        direct_recipient = self.example_user("cordelia")
        group_member = self.example_user("iago")
        puppet_handler = self.example_user("prospero")
        non_recipient = self.example_user("othello")

        stream_name = "Verona"
        for user in [sender, direct_recipient, group_member, puppet_handler, non_recipient]:
            self.subscribe(user, stream_name)

        stream = get_stream(stream_name, sender.realm)
        stream.enable_puppet_mode = True
        stream.save()

        # Create a user group
        user_group = check_add_user_group(
            sender.realm, "whisper_puppet_group", [group_member], acting_user=sender
        )

        # Create a puppet
        puppet = StreamPuppet.objects.create(
            stream=stream,
            name="Gandalf",
            created_by=sender,
            visibility_mode=StreamPuppet.VISIBILITY_CLAIMED,
        )
        claim_puppet(puppet, puppet_handler)

        self.login_user(sender)
        result = self.client_post(
            "/json/messages",
            {
                "type": "stream",
                "to": orjson.dumps(stream_name).decode(),
                "content": "Whisper to all types",
                "topic": "whisper test",
                "whisper_to_user_ids": orjson.dumps([direct_recipient.id]).decode(),
                "whisper_to_group_ids": orjson.dumps([user_group.id]).decode(),
                "whisper_to_puppet_ids": orjson.dumps([puppet.id]).decode(),
            },
        )
        self.assert_json_success(result)
        message_id = orjson.loads(result.content)["id"]

        # All intended recipients should have UserMessage
        for user in [sender, direct_recipient, group_member, puppet_handler]:
            self.assertTrue(
                UserMessage.objects.filter(user_profile=user, message_id=message_id).exists(),
                f"{user.email} should have received the whisper",
            )

        # Non-recipient should NOT have UserMessage
        self.assertFalse(
            UserMessage.objects.filter(user_profile=non_recipient, message_id=message_id).exists()
        )

    def test_invalid_puppet_id_rejected(self) -> None:
        """Test that invalid puppet IDs are rejected."""
        sender = self.example_user("hamlet")

        stream_name = "Verona"
        self.subscribe(sender, stream_name)

        stream = get_stream(stream_name, sender.realm)
        stream.enable_puppet_mode = True
        stream.save()

        self.login_user(sender)
        result = self.client_post(
            "/json/messages",
            {
                "type": "stream",
                "to": orjson.dumps(stream_name).decode(),
                "content": "Whisper to invalid puppet",
                "topic": "whisper test",
                "whisper_to_puppet_ids": orjson.dumps([99999]).decode(),
            },
        )
        self.assert_json_error(result, "Invalid puppet ID: 99999")

    def test_puppet_from_different_stream_rejected(self) -> None:
        """Test that puppet IDs from a different stream are rejected."""
        from zerver.models.streams import StreamPuppet

        sender = self.example_user("hamlet")

        stream1_name = "Verona"
        stream2_name = "Denmark"
        self.subscribe(sender, stream1_name)
        self.subscribe(sender, stream2_name)

        stream1 = get_stream(stream1_name, sender.realm)
        stream1.enable_puppet_mode = True
        stream1.save()

        stream2 = get_stream(stream2_name, sender.realm)
        stream2.enable_puppet_mode = True
        stream2.save()

        # Create puppet in stream2
        puppet = StreamPuppet.objects.create(
            stream=stream2,
            name="Gandalf",
            created_by=sender,
        )

        # Try to whisper to that puppet in stream1
        self.login_user(sender)
        result = self.client_post(
            "/json/messages",
            {
                "type": "stream",
                "to": orjson.dumps(stream1_name).decode(),
                "content": "Whisper to puppet from different stream",
                "topic": "whisper test",
                "whisper_to_puppet_ids": orjson.dumps([puppet.id]).decode(),
            },
        )
        self.assert_json_error(result, f"Puppet {puppet.id} does not belong to this channel")


class PuppetHandlerAPITest(ZulipTestCase):
    """Tests for puppet handler management APIs."""

    def test_claim_puppet(self) -> None:
        """Test claiming a puppet via API."""
        from zerver.models.streams import PuppetHandler, StreamPuppet

        user = self.example_user("hamlet")
        self.login_user(user)

        stream_name = "Verona"
        self.subscribe(user, stream_name)

        stream = get_stream(stream_name, user.realm)
        stream.enable_puppet_mode = True
        stream.save()

        puppet = StreamPuppet.objects.create(
            stream=stream,
            name="Gandalf",
            created_by=user,
        )

        result = self.client_post(
            f"/json/streams/{stream.id}/puppets/{puppet.id}/handlers",
        )
        self.assert_json_success(result)

        # Verify handler was created
        self.assertTrue(
            PuppetHandler.objects.filter(
                puppet=puppet,
                handler=user,
                handler_type=PuppetHandler.HANDLER_TYPE_CLAIMED,
            ).exists()
        )

    def test_unclaim_puppet(self) -> None:
        """Test unclaiming a puppet via API."""
        from zerver.actions.stream_puppets import claim_puppet
        from zerver.models.streams import PuppetHandler, StreamPuppet

        user = self.example_user("hamlet")
        self.login_user(user)

        stream_name = "Verona"
        self.subscribe(user, stream_name)

        stream = get_stream(stream_name, user.realm)
        stream.enable_puppet_mode = True
        stream.save()

        puppet = StreamPuppet.objects.create(
            stream=stream,
            name="Gandalf",
            created_by=user,
        )
        claim_puppet(puppet, user)

        result = self.client_delete(
            f"/json/streams/{stream.id}/puppets/{puppet.id}/handlers/{user.id}",
        )
        self.assert_json_success(result)

        # Verify handler was removed
        self.assertFalse(
            PuppetHandler.objects.filter(
                puppet=puppet,
                handler=user,
            ).exists()
        )

    def test_set_puppet_visibility_mode(self) -> None:
        """Test setting puppet visibility mode via API."""
        from zerver.models.streams import StreamPuppet

        user = self.example_user("hamlet")
        self.login_user(user)

        stream_name = "Verona"
        self.subscribe(user, stream_name)

        stream = get_stream(stream_name, user.realm)
        stream.enable_puppet_mode = True
        stream.save()

        puppet = StreamPuppet.objects.create(
            stream=stream,
            name="Gandalf",
            created_by=user,
            visibility_mode=StreamPuppet.VISIBILITY_OPEN,
        )

        result = self.client_patch(
            f"/json/streams/{stream.id}/puppets/{puppet.id}/visibility",
            {"visibility_mode": "claimed"},
        )
        self.assert_json_success(result)

        puppet.refresh_from_db()
        self.assertEqual(puppet.visibility_mode, StreamPuppet.VISIBILITY_CLAIMED)

    def test_get_puppet_handlers(self) -> None:
        """Test getting puppet handlers via API."""
        from zerver.actions.stream_puppets import claim_puppet
        from zerver.models.streams import StreamPuppet

        user = self.example_user("hamlet")
        handler = self.example_user("cordelia")
        self.login_user(user)

        stream_name = "Verona"
        self.subscribe(user, stream_name)
        self.subscribe(handler, stream_name)

        stream = get_stream(stream_name, user.realm)
        stream.enable_puppet_mode = True
        stream.save()

        puppet = StreamPuppet.objects.create(
            stream=stream,
            name="Gandalf",
            created_by=user,
        )
        claim_puppet(puppet, handler)

        result = self.client_get(
            f"/json/streams/{stream.id}/puppets/{puppet.id}/handlers",
        )
        self.assert_json_success(result)
        data = orjson.loads(result.content)
        self.assertEqual(len(data["handlers"]), 1)
        self.assertEqual(data["handlers"][0]["user_id"], handler.id)


class BotPuppetWhisperEventTest(ZulipTestCase):
    """Tests for bot service events when puppets are whispered to."""

    def test_bot_receives_puppet_whisper_event(self) -> None:
        """Test that a bot receives puppet_whisper events when its puppet is whispered to."""
        from zerver.actions.message_send import get_service_bot_events
        from zerver.actions.stream_puppets import claim_puppet
        from zerver.models.streams import StreamPuppet

        sender = self.example_user("hamlet")
        cordelia = self.example_user("cordelia")

        # Create an embedded bot owned by cordelia
        bot = self.create_test_bot(
            short_name="puppet-bot",
            user_profile=cordelia,
            bot_type=UserProfile.EMBEDDED_BOT,
        )
        assert bot.bot_type is not None

        stream_name = "Verona"
        self.subscribe(sender, stream_name)
        self.subscribe(bot, stream_name)

        stream = get_stream(stream_name, sender.realm)
        stream.enable_puppet_mode = True
        stream.save()

        # Create a puppet and have the bot claim it
        puppet = StreamPuppet.objects.create(
            stream=stream,
            name="Gandalf",
            created_by=sender,
            visibility_mode=StreamPuppet.VISIBILITY_CLAIMED,
        )
        claim_puppet(puppet, bot)

        # Test get_service_bot_events with puppet whisper
        event_dict = get_service_bot_events(
            sender=sender,
            service_bot_tuples=[
                (bot.id, bot.bot_type),
            ],
            mentioned_user_ids=set(),
            active_user_ids={bot.id},
            recipient_type=Recipient.STREAM,
            puppet_whisper_bot_ids={bot.id},
            whispered_puppet_ids=[puppet.id],
        )

        # Bot should receive a puppet_whisper event
        self.assertIn("embedded_bots", event_dict)
        self.assertEqual(len(event_dict["embedded_bots"]), 1)
        event = event_dict["embedded_bots"][0]
        self.assertEqual(event["trigger"], "puppet_whisper")
        self.assertEqual(event["user_profile_id"], bot.id)
        self.assertEqual(event["puppet_ids"], [puppet.id])

    def test_bot_does_not_receive_event_for_unclaimed_puppet(self) -> None:
        """Test that a bot doesn't receive events for puppets it doesn't handle."""
        from zerver.actions.message_send import get_service_bot_events
        from zerver.models.streams import StreamPuppet

        sender = self.example_user("hamlet")
        cordelia = self.example_user("cordelia")

        # Create an embedded bot owned by cordelia
        bot = self.create_test_bot(
            short_name="puppet-bot",
            user_profile=cordelia,
            bot_type=UserProfile.EMBEDDED_BOT,
        )
        assert bot.bot_type is not None

        stream_name = "Verona"
        self.subscribe(sender, stream_name)
        self.subscribe(bot, stream_name)

        stream = get_stream(stream_name, sender.realm)
        stream.enable_puppet_mode = True
        stream.save()

        # Create a puppet but don't claim it for the bot
        puppet = StreamPuppet.objects.create(
            stream=stream,
            name="Gandalf",
            created_by=sender,
            visibility_mode=StreamPuppet.VISIBILITY_CLAIMED,
        )

        # Test get_service_bot_events - bot is not in puppet_whisper_bot_ids
        event_dict = get_service_bot_events(
            sender=sender,
            service_bot_tuples=[
                (bot.id, bot.bot_type),
            ],
            mentioned_user_ids=set(),
            active_user_ids={bot.id},
            recipient_type=Recipient.STREAM,
            puppet_whisper_bot_ids=set(),  # Empty - no bots handle this puppet
            whispered_puppet_ids=[puppet.id],
        )

        # Bot should NOT receive any events
        self.assert_length(event_dict, 0)

    def test_outgoing_webhook_bot_receives_puppet_whisper_event(self) -> None:
        """Test that outgoing webhook bots also receive puppet_whisper events."""
        from zerver.actions.message_send import get_service_bot_events
        from zerver.actions.stream_puppets import claim_puppet
        from zerver.models.streams import StreamPuppet

        sender = self.example_user("hamlet")
        cordelia = self.example_user("cordelia")

        # Create an outgoing webhook bot
        bot = self.create_test_bot(
            short_name="webhook-bot",
            user_profile=cordelia,
            bot_type=UserProfile.OUTGOING_WEBHOOK_BOT,
        )
        assert bot.bot_type is not None

        stream_name = "Verona"
        self.subscribe(sender, stream_name)
        self.subscribe(bot, stream_name)

        stream = get_stream(stream_name, sender.realm)
        stream.enable_puppet_mode = True
        stream.save()

        # Create a puppet and have the bot claim it
        puppet = StreamPuppet.objects.create(
            stream=stream,
            name="Gandalf",
            created_by=sender,
            visibility_mode=StreamPuppet.VISIBILITY_CLAIMED,
        )
        claim_puppet(puppet, bot)

        # Test get_service_bot_events with puppet whisper
        event_dict = get_service_bot_events(
            sender=sender,
            service_bot_tuples=[
                (bot.id, bot.bot_type),
            ],
            mentioned_user_ids=set(),
            active_user_ids={bot.id},
            recipient_type=Recipient.STREAM,
            puppet_whisper_bot_ids={bot.id},
            whispered_puppet_ids=[puppet.id],
        )

        # Bot should receive a puppet_whisper event in outgoing_webhooks queue
        self.assertIn("outgoing_webhooks", event_dict)
        self.assertEqual(len(event_dict["outgoing_webhooks"]), 1)
        event = event_dict["outgoing_webhooks"][0]
        self.assertEqual(event["trigger"], "puppet_whisper")
        self.assertEqual(event["user_profile_id"], bot.id)
        self.assertEqual(event["puppet_ids"], [puppet.id])
