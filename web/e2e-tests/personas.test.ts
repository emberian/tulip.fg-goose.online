import assert from "node:assert/strict";

import type {Page} from "puppeteer";

import * as common from "./lib/common.ts";

async function open_settings(page: Page): Promise<void> {
    await common.open_personal_menu(page);

    const settings_selector = "#personal-menu-dropdown a[href^='#settings']";
    await page.waitForSelector(settings_selector, {visible: true});
    await page.click(settings_selector);

    await page.waitForSelector("#settings_content .profile-settings-form", {visible: true});
    await page.waitForSelector("#settings_overlay_container", {visible: true});
}

async function navigate_to_characters_section(page: Page): Promise<void> {
    // Click on "My Characters" section in settings
    const characters_section = '[data-section="my-characters"]';
    await page.waitForSelector(characters_section, {visible: true});
    await page.click(characters_section);
    await page.waitForSelector("#my-characters-settings", {visible: true});
}

async function test_create_persona(page: Page): Promise<void> {
    // Click "Add character" button
    await page.waitForSelector("#add-new-character-button", {visible: true});
    await page.click("#add-new-character-button");

    // Wait for modal to open
    await common.wait_for_micromodal_to_open(page);

    // Fill in the form
    await page.type("#character-name", "Gandalf the Grey");
    await page.type("#character-bio", "A wizard is never late");

    // Set a custom color
    await page.evaluate(() => {
        const colorInput = document.querySelector<HTMLInputElement>("#character-color");
        if (colorInput) {
            colorInput.value = "#5e35b1";
            colorInput.dispatchEvent(new Event("change", {bubbles: true}));
        }
    });

    // Submit the form
    await page.click(".dialog_submit_button");

    // Wait for modal to close
    await common.wait_for_micromodal_to_close(page);

    // Verify the persona appears in the list
    await page.waitForSelector('#my_characters_table tr[data-persona-id]', {visible: true});
    const persona_name = await common.get_text_from_selector(
        page,
        "#my_characters_table .character-name",
    );
    assert.equal(persona_name, "Gandalf the Grey");
}

async function test_edit_persona(page: Page): Promise<void> {
    // Click edit button on the persona row
    await page.waitForSelector(".edit-character-button", {visible: true});
    await page.click(".edit-character-button");

    // Wait for modal to open
    await common.wait_for_micromodal_to_open(page);

    // Verify the name is pre-filled
    const name_value = await page.evaluate(
        () => document.querySelector<HTMLInputElement>("#character-name")?.value,
    );
    assert.equal(name_value, "Gandalf the Grey");

    // Clear and update the name
    await common.clear_and_type(page, "#character-name", "Gandalf the White");

    // Submit the form
    await page.click(".dialog_submit_button");

    // Wait for modal to close
    await common.wait_for_micromodal_to_close(page);

    // Verify the name was updated
    await page.waitForFunction(
        () =>
            document.querySelector("#my_characters_table .character-name")?.textContent ===
            "Gandalf the White",
    );
}

async function test_persona_selector_visible(page: Page): Promise<void> {
    // Close settings
    await page.keyboard.press("Escape");
    await page.waitForSelector("#settings_overlay_container", {hidden: true});

    // Open compose box
    await page.keyboard.press("KeyC");
    await page.waitForSelector("#compose-textarea", {visible: true});

    // Verify persona selector is visible (since we have at least one persona)
    await page.waitForSelector("#compose-persona-selector", {visible: true});
    await page.waitForSelector(".persona-selector-button", {visible: true});

    // Verify it shows "Yourself" by default
    const persona_name = await common.get_text_from_selector(page, ".persona-selector-button .persona-name");
    assert.equal(persona_name, "Yourself");
}

async function test_select_persona_from_menu(page: Page): Promise<void> {
    // Click the persona selector button
    await page.click(".persona-selector-button");

    // Wait for the popover menu
    await page.waitForSelector(".persona-menu", {visible: true});

    // Click on our persona (the second item - first is "Yourself" with empty data-persona-id)
    const persona_item = await page.waitForSelector(
        '.persona-menu-item:not([data-persona-id=""])',
        {visible: true},
    );
    await persona_item!.click();

    // Verify the selector now shows the persona name
    await page.waitForFunction(
        () =>
            document.querySelector(".persona-selector-button .persona-name")?.textContent ===
            "Gandalf the White",
    );

    // Verify the button has the "using-persona" class
    const using_persona = await page.$eval(".persona-selector-button", (el) =>
        el.classList.contains("using-persona"),
    );
    assert.ok(using_persona, "Button should have using-persona class");
}

async function test_send_message_as_persona(page: Page): Promise<void> {
    // Fill in stream and topic
    await common.select_stream_in_compose_via_dropdown(page, "Verona");
    await common.clear_and_type(page, "#stream_message_recipient_topic", "Persona test");

    // Type message content
    await page.type("#compose-textarea", "You shall not pass!");

    // Send the message by clicking the send button
    await page.waitForSelector("#compose-send-button", {visible: true});
    await page.click("#compose-send-button");

    // Wait for message to be sent
    await common.wait_for_fully_processed_message(page, "You shall not pass!");

    // Verify the message shows the persona name (not the real user name)
    // The name is in: .sender_name_text > .user-name
    const message_sender = await page.waitForSelector(
        `xpath/(//*[contains(@class, "user-name") and contains(text(), "Gandalf the White")])[last()]`,
        {visible: true},
    );
    assert.ok(message_sender !== null, "Message should show persona name as sender");
}

async function test_keyboard_shortcut_cycles_personas(page: Page): Promise<void> {
    // Open compose box again
    await page.keyboard.press("KeyC");
    await page.waitForSelector("#compose-textarea", {visible: true});

    // The persona from the previous send should still be selected
    // Use Ctrl+Shift+P to cycle to next (should go back to "Yourself")
    await page.keyboard.down("Control");
    await page.keyboard.down("Shift");
    await page.keyboard.press("KeyP");
    await page.keyboard.up("Shift");
    await page.keyboard.up("Control");

    // Should now show "Yourself"
    await page.waitForFunction(
        () =>
            document.querySelector(".persona-selector-button .persona-name")?.textContent ===
            "Yourself",
    );

    // Cycle again - should go back to persona
    await page.keyboard.down("Control");
    await page.keyboard.down("Shift");
    await page.keyboard.press("KeyP");
    await page.keyboard.up("Shift");
    await page.keyboard.up("Control");

    await page.waitForFunction(
        () =>
            document.querySelector(".persona-selector-button .persona-name")?.textContent ===
            "Gandalf the White",
    );

    // Close compose box
    await page.keyboard.press("Escape");
    await page.waitForSelector("#compose-textarea", {hidden: true});
}

async function create_persona(page: Page, name: string, color?: string): Promise<void> {
    await page.waitForSelector("#add-new-character-button", {visible: true});
    await page.click("#add-new-character-button");
    await common.wait_for_micromodal_to_open(page);
    await page.type("#character-name", name);
    if (color) {
        await page.evaluate((c) => {
            const colorInput = document.querySelector<HTMLInputElement>("#character-color");
            if (colorInput) {
                colorInput.value = c;
                colorInput.dispatchEvent(new Event("change", {bubbles: true}));
            }
        }, color);
    }
    await page.click(".dialog_submit_button");
    await common.wait_for_micromodal_to_close(page);
}

async function select_persona_by_name(page: Page, name: string): Promise<void> {
    // Click the persona selector button
    await page.click(".persona-selector-button");
    await page.waitForSelector(".persona-menu", {visible: true});

    if (name === "Yourself") {
        // Select "Yourself" option (empty data-persona-id)
        const yourself_item = await page.waitForSelector(
            '.persona-menu-item[data-persona-id=""]',
            {visible: true},
        );
        await yourself_item!.click();
    } else {
        // Find and click the persona by name
        const persona_item = await page.waitForSelector(
            `xpath///*[contains(@class, "persona-menu-item")]//*[contains(@class, "persona-name") and contains(text(), "${name}")]/..`,
            {visible: true},
        );
        await persona_item!.click();
    }

    // Wait for menu to close and selector to update
    await page.waitForSelector(".persona-menu", {hidden: true});
    await page.waitForFunction(
        (expected) =>
            document.querySelector(".persona-selector-button .persona-name")?.textContent === expected,
        {},
        name,
    );
}

async function send_message_with_current_persona(page: Page, content: string): Promise<void> {
    await page.type("#compose-textarea", content);
    await page.waitForSelector("#compose-send-button", {visible: true});
    await page.click("#compose-send-button");
    await common.wait_for_fully_processed_message(page, content);
}

async function count_sender_headers_in_topic(page: Page): Promise<number> {
    // Count the number of visible sender headers (include_sender = true means header is shown)
    // Each message group with a new sender shows .sender_name_text
    return await page.$$eval(
        ".message_row .sender_name_text",
        (elements) =>
            elements.filter((el) => (el as HTMLElement).offsetParent !== null).length,
    );
}

async function get_sender_names_in_order(page: Page): Promise<string[]> {
    // Get all visible sender names in order (only from rows that show sender)
    return await page.$$eval(".message_row .sender_name_text .user-name", (elements) =>
        elements
            .filter((el) => (el as HTMLElement).offsetParent !== null)
            .map((el) => el.textContent?.trim() ?? ""),
    );
}

async function test_multiple_personas_not_collapsed(page: Page): Promise<void> {
    // This test verifies that messages from different personas (and self)
    // are NOT collapsed together, and that this persists after page refresh

    // First, ensure we're in settings and create a second persona
    await open_settings(page);
    await navigate_to_characters_section(page);

    // Create a second persona
    await create_persona(page, "Frodo Baggins", "#4caf50");

    // Verify we now have 2 personas
    const persona_count = await page.$$eval(
        '#my_characters_table tr[data-persona-id]',
        (rows) => rows.length,
    );
    assert.equal(persona_count, 2, "Should have 2 personas");

    // Close settings
    await page.keyboard.press("Escape");
    await page.waitForSelector("#settings_overlay_container", {hidden: true});

    // Open compose and navigate to the test topic
    await page.keyboard.press("KeyC");
    await page.waitForSelector("#compose-textarea", {visible: true});
    await common.select_stream_in_compose_via_dropdown(page, "Verona");
    await common.clear_and_type(page, "#stream_message_recipient_topic", "Collapsing test");

    // Send message 1: as Yourself
    await select_persona_by_name(page, "Yourself");
    await send_message_with_current_persona(page, "Message from myself");

    // Send message 2: as Gandalf
    await select_persona_by_name(page, "Gandalf the White");
    await send_message_with_current_persona(page, "Message from Gandalf");

    // Send message 3: as Frodo
    await select_persona_by_name(page, "Frodo Baggins");
    await send_message_with_current_persona(page, "Message from Frodo");

    // Send message 4: as Yourself again
    await select_persona_by_name(page, "Yourself");
    await send_message_with_current_persona(page, "Another message from myself");

    // Send message 5: as Gandalf again (should collapse with previous Gandalf? No - there's Frodo in between)
    await select_persona_by_name(page, "Gandalf the White");
    await send_message_with_current_persona(page, "Gandalf speaks again");

    // Now verify the messages are NOT collapsed together
    // We should see 5 sender headers (one for each identity switch)
    const sender_count_before_refresh = await count_sender_headers_in_topic(page);
    assert.equal(
        sender_count_before_refresh,
        5,
        `Expected 5 sender headers before refresh, got ${sender_count_before_refresh}`,
    );

    // Verify the order of sender names
    const sender_names_before = await get_sender_names_in_order(page);
    assert.deepEqual(
        sender_names_before,
        ["Desdemona", "Gandalf the White", "Frodo Baggins", "Desdemona", "Gandalf the White"],
        `Sender names before refresh should be in correct order`,
    );

    // Now refresh the page and verify messages are still not collapsed
    // Navigate directly to the topic URL (this also acts as a refresh)
    await page.goto(
        "http://zulip.zulipdev.com:9981/#narrow/stream/Verona/topic/Collapsing.20test",
        {waitUntil: "networkidle2"},
    );

    // Wait for the topic messages to load
    await common.wait_for_fully_processed_message(page, "Gandalf speaks again");

    // Verify sender headers are still correct after refresh
    const sender_count_after_refresh = await count_sender_headers_in_topic(page);
    assert.equal(
        sender_count_after_refresh,
        5,
        `Expected 5 sender headers after refresh, got ${sender_count_after_refresh}`,
    );

    // Verify sender names are still in correct order
    const sender_names_after = await get_sender_names_in_order(page);
    assert.deepEqual(
        sender_names_after,
        ["Desdemona", "Gandalf the White", "Frodo Baggins", "Desdemona", "Gandalf the White"],
        `Sender names after refresh should match before refresh`,
    );
}

async function test_delete_persona(page: Page): Promise<void> {
    // Re-open settings
    await open_settings(page);
    await navigate_to_characters_section(page);

    // Wait for the persona list to load (should have 2 personas from the collapsing test)
    await page.waitForSelector('#my_characters_table tr[data-persona-id]', {visible: true});

    // Delete all personas one by one
    // We need to delete until no more delete buttons are visible
    while (true) {
        const delete_button = await page.$(".delete-character-button");
        if (!delete_button) {
            break;
        }
        await page.click(".delete-character-button");
        await common.wait_for_micromodal_to_open(page);
        await page.click(".dialog_submit_button");
        await common.wait_for_micromodal_to_close(page);
        // Wait a moment for the list to update
        await page.waitForFunction(
            () => document.querySelector(".dialog_submit_button") === null,
            {timeout: 5000},
        ).catch(() => {
            // Modal already closed
        });
    }

    // Verify all personas are removed
    await page.waitForSelector('#my_characters_table tr[data-persona-id]', {hidden: true});
}

async function test_persona_selector_hidden_when_no_personas(page: Page): Promise<void> {
    // Close settings
    await page.keyboard.press("Escape");
    await page.waitForSelector("#settings_overlay_container", {hidden: true});

    // Open compose box
    await page.keyboard.press("KeyC");
    await page.waitForSelector("#compose-textarea", {visible: true});

    // Persona selector should be hidden since we have no personas
    await page.waitForSelector("#compose-persona-selector", {hidden: true});

    // Close compose box
    await page.keyboard.press("Escape");
    await page.waitForSelector("#compose-textarea", {hidden: true});
}

async function test_duplicate_persona_name_error(page: Page): Promise<void> {
    // Re-open settings
    await open_settings(page);
    await navigate_to_characters_section(page);

    // Create first persona
    await page.click("#add-new-character-button");
    await common.wait_for_micromodal_to_open(page);
    await page.type("#character-name", "Aragorn");
    await page.click(".dialog_submit_button");
    await common.wait_for_micromodal_to_close(page);

    // Try to create another persona with the same name
    await page.click("#add-new-character-button");
    await common.wait_for_micromodal_to_open(page);
    await page.type("#character-name", "Aragorn");
    await page.click(".dialog_submit_button");

    // Should see error message in the modal
    await page.waitForSelector("#dialog_error", {visible: true});
    const error_text = await common.get_text_from_selector(page, "#dialog_error");
    assert.ok(
        error_text.includes("already have a persona with this name"),
        `Expected duplicate name error, got: ${error_text}`,
    );

    // Close the modal
    await page.click(".dialog_exit_button");
    await common.wait_for_micromodal_to_close(page);

    // Clean up - delete the persona we created
    await page.click(".delete-character-button");
    await common.wait_for_micromodal_to_open(page);
    await page.click(".dialog_submit_button");
    await common.wait_for_micromodal_to_close(page);
}

async function personas_tests(page: Page): Promise<void> {
    await common.log_in(page);

    // Navigate to settings
    await open_settings(page);
    await navigate_to_characters_section(page);

    // Test persona CRUD and usage
    await test_create_persona(page);
    await test_edit_persona(page);
    await test_persona_selector_visible(page);
    await test_select_persona_from_menu(page);
    await test_send_message_as_persona(page);
    await test_keyboard_shortcut_cycles_personas(page);
    // Test that messages from different personas don't collapse together
    await test_multiple_personas_not_collapsed(page);
    await test_delete_persona(page);
    await test_persona_selector_hidden_when_no_personas(page);
    await test_duplicate_persona_name_error(page);
}

await common.run_test(personas_tests);
