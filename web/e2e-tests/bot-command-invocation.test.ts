/**
 * End-to-end tests for bot command invocation.
 *
 * These tests verify the full slash command flow:
 * 1. Bot registers a command via API
 * 2. User types "/" and sees command in typeahead
 * 3. User enters command mode (pill-based UI)
 * 4. User fills in arguments and sends
 * 5. Bot receives structured command_invocation event
 * 6. command_invocation widget renders in message
 *
 * Run with: ./tools/test-js-with-puppeteer --with-queue-worker bot-command-invocation
 */

import assert from "node:assert/strict";
import {setTimeout as sleep} from "node:timers/promises";

import type {Page} from "puppeteer";

import * as common from "./lib/common.ts";

const OUTGOING_WEBHOOK_BOT_TYPE = "3";
const BOT_SERVER_PORT = process.env["TEST_BOT_SERVER_PORT"] ?? "9877";
const BOT_SERVER_URL = `http://127.0.0.1:${BOT_SERVER_PORT}`;

interface BotCredentials {
    user_id: number;
    email: string;
    api_key: string;
}

interface CommandOption {
    name: string;
    type: string;
    description?: string;
    required?: boolean;
    choices?: Array<{name: string; value: string}>;
}

interface CommandInvocationRequest {
    type: string;
    command: string;
    arguments: Record<string, string>;
    interaction_id: string;
    user: {
        id: number;
        email: string;
        full_name: string;
    };
}

// ============ Test Bot Server Control ============

async function reset_bot_server(): Promise<void> {
    await fetch(`${BOT_SERVER_URL}/control/reset`, {method: "POST"});
}

async function get_bot_requests(): Promise<CommandInvocationRequest[]> {
    const response = await fetch(`${BOT_SERVER_URL}/control/requests`);
    const data = (await response.json()) as {requests: CommandInvocationRequest[]};
    return data.requests;
}

async function wait_for_command_invocation(
    timeout_ms: number = 10000,
): Promise<CommandInvocationRequest> {
    const start = Date.now();
    while (Date.now() - start < timeout_ms) {
        const requests = await get_bot_requests();
        const invocation = requests.find((r) => r.type === "command_invocation");
        if (invocation) {
            return invocation;
        }
        await sleep(200);
    }
    throw new Error("Timeout waiting for command invocation");
}

// ============ Bot Setup Helpers ============

async function navigate_to_settings_bots(page: Page): Promise<void> {
    await page.goto("http://zulip.zulipdev.com:9981/#settings/your-bots");
    await page.waitForSelector("#admin-bot-list", {visible: true});
    await sleep(500);
}

async function create_webhook_bot(
    page: Page,
    bot_name: string,
    bot_short_name: string,
    webhook_url: string,
): Promise<BotCredentials> {
    // Click add new bot button
    await page.click("#admin-bot-list .add-a-new-bot");
    await common.wait_for_micromodal_to_open(page);

    // Fill the bot creation form
    await common.fill_form(page, "#create_bot_form", {
        bot_name,
        bot_short_name,
        bot_type: OUTGOING_WEBHOOK_BOT_TYPE,
        payload_url: webhook_url,
    });

    // Submit
    await page.click(".micromodal .dialog_submit_button");
    await common.wait_for_micromodal_to_close(page);

    // Wait for bot to appear in list
    await sleep(1000);

    // Get the bot's user ID
    const user_id = await common.get_user_id_from_name(page, bot_name);
    assert.ok(user_id, `Failed to get user_id for bot ${bot_name}`);

    // Open bot management modal to get API key
    const manage_button_selector = `#admin_your_bots_table .user_row[data-user-id="${user_id}"] .manage-user-button`;
    await page.waitForSelector(manage_button_selector, {visible: true});
    await page.click(manage_button_selector);
    await common.wait_for_micromodal_to_open(page);

    // Click the download zuliprc button to populate the hidden link
    const download_zuliprc_selector = ".download-bot-zuliprc";
    await page.waitForSelector(download_zuliprc_selector, {visible: true});
    await page.click(download_zuliprc_selector);

    // Get the bot's email and API key from the hidden zuliprc download link
    const zuliprc_selector = ".micromodal .hidden-zuliprc-download";
    await page.waitForSelector(`${zuliprc_selector}[href^="data:"]`);

    const zuliprc_content = await page.$eval(zuliprc_selector, (el) => {
        const href = (el as HTMLAnchorElement).href;
        return decodeURIComponent(href.replace("data:application/octet-stream;charset=utf-8,", ""));
    });

    // Parse the zuliprc content to get email and key
    const email_match = zuliprc_content.match(/email=(.+)/);
    const key_match = zuliprc_content.match(/key=(.+)/);
    assert.ok(email_match && key_match, "Failed to extract bot credentials from zuliprc");

    const email = email_match[1]!.trim();
    const api_key = key_match[1]!.trim();

    // Close the modal
    await page.click(".micromodal .modal__close");
    await common.wait_for_micromodal_to_close(page);

    return {user_id, email, api_key};
}

// ============ Command Registration ============

async function register_bot_command(
    bot: BotCredentials,
    name: string,
    description: string,
    options: CommandOption[],
): Promise<void> {
    const auth = Buffer.from(`${bot.email}:${bot.api_key}`).toString("base64");

    // Use form-urlencoded format as expected by the API
    const formData = new URLSearchParams();
    formData.append("name", name);
    formData.append("description", description);
    formData.append("options", JSON.stringify(options));

    const response = await fetch("http://zulip.zulipdev.com:9981/api/v1/bot_commands", {
        method: "POST",
        headers: {
            Authorization: `Basic ${auth}`,
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formData.toString(),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to register command: ${response.status} - ${text}`);
    }
}

// ============ Compose Box Helpers ============

async function navigate_to_stream_topic(
    page: Page,
    stream_name: string,
    topic: string,
): Promise<void> {
    await page.goto(
        `http://zulip.zulipdev.com:9981/#narrow/stream/${encodeURIComponent(stream_name)}/topic/${encodeURIComponent(topic)}`,
    );
    await page.waitForSelector("#message_view_header", {visible: true});
    await sleep(1000);
}

async function open_compose_box(page: Page): Promise<void> {
    // Click the compose button or press 'c' to open compose
    await page.keyboard.press("c");
    await page.waitForSelector("#compose-textarea", {visible: true});
    await sleep(300);
}

async function type_in_compose(page: Page, text: string): Promise<void> {
    await page.type("#compose-textarea", text);
}

async function select_command_from_typeahead(page: Page, command_name: string): Promise<void> {
    // Type "/" to trigger command typeahead
    await type_in_compose(page, "/");
    await sleep(300);

    // Wait for typeahead to appear with our command
    await page.waitForFunction(
        (cmdName) => {
            const items = document.querySelectorAll(".typeahead .active, .typeahead li");
            for (const item of items) {
                if (item.textContent?.includes(`/${cmdName}`)) {
                    return true;
                }
            }
            return false;
        },
        {timeout: 5000},
        command_name,
    );

    // Type the command name to filter
    await type_in_compose(page, command_name);
    await sleep(200);

    // Press Tab or Enter to select the command
    await page.keyboard.press("Tab");
    await sleep(300);
}

async function wait_for_command_mode(page: Page): Promise<void> {
    // Wait for the command compose container to appear
    await page.waitForSelector("#command-compose-container", {visible: true, timeout: 5000});
}

async function enter_command_argument(page: Page, value: string): Promise<void> {
    // Type in the current field input
    const input_selector = ".command-field-input";
    await page.waitForSelector(input_selector, {visible: true});
    await page.type(input_selector, value);
}

async function advance_to_next_field(page: Page): Promise<void> {
    await page.keyboard.press("Tab");
    await sleep(100);
}

async function send_command(page: Page): Promise<void> {
    await page.keyboard.press("Enter");
    await sleep(500);
}

// ============ Test Cases ============

async function test_command_registration_and_typeahead(
    page: Page,
    bot: BotCredentials,
): Promise<void> {
    console.log("Testing command registration and typeahead...");

    // Register a test command
    await register_bot_command(bot, "testcmd", "A test command for e2e testing", [
        {
            name: "message",
            type: "string",
            description: "A message to echo",
            required: true,
        },
        {
            name: "count",
            type: "string",
            description: "Number of times to repeat",
            required: false,
        },
    ]);

    console.log("Command registered, waiting for event propagation...");
    await sleep(2000);

    // Navigate to a stream to compose
    await navigate_to_stream_topic(page, "Verona", "command-test");

    // Open compose box
    await open_compose_box(page);

    // Type "/" and verify command appears in typeahead
    await type_in_compose(page, "/");
    await sleep(500);

    // Check that typeahead shows our command
    const typeahead_visible = await page.waitForFunction(
        () => {
            const typeahead = document.querySelector(".typeahead");
            return typeahead && typeahead.textContent?.includes("/testcmd");
        },
        {timeout: 5000},
    );
    assert.ok(typeahead_visible, "Command should appear in typeahead");

    console.log("Command registration and typeahead test passed!");
}

async function test_command_mode_entry(page: Page): Promise<void> {
    console.log("Testing command mode entry...");

    // Clear compose and start fresh
    await page.click("#compose-textarea");
    await page.keyboard.down("Control");
    await page.keyboard.press("a");
    await page.keyboard.up("Control");
    await page.keyboard.press("Backspace");

    // Select command from typeahead
    await select_command_from_typeahead(page, "testcmd");

    // Wait for command mode UI
    await wait_for_command_mode(page);

    // Verify command name pill exists
    const command_pill = await page.$(".command-name-pill");
    assert.ok(command_pill, "Command name pill should exist");

    const pill_text = await page.$eval(".command-name-pill", (el) => el.textContent);
    assert.equal(pill_text, "/testcmd", "Command pill should show /testcmd");

    // Verify field pills exist
    const field_pills = await page.$$(".command-field-pill");
    assert.equal(field_pills.length, 2, "Should have 2 field pills (message and count)");

    // Verify first field is focused (has input)
    const field_input = await page.$(".command-field-input");
    assert.ok(field_input, "First field should have an input");

    console.log("Command mode entry test passed!");
}

async function test_argument_input_and_navigation(page: Page): Promise<void> {
    console.log("Testing argument input and navigation...");

    // Enter value in first field (message)
    await enter_command_argument(page, "hello world");

    // Tab to next field
    await advance_to_next_field(page);
    await sleep(100);

    // Verify first field now shows value (not input)
    const first_pill_value = await page.$eval(
        '.command-field-pill[data-field-index="0"] .field-value',
        (el) => el.textContent,
    );
    assert.equal(first_pill_value, "hello world", "First field should show entered value");

    // Enter value in second field (count)
    await enter_command_argument(page, "3");

    console.log("Argument input and navigation test passed!");
}

async function test_command_invocation_delivery(page: Page): Promise<void> {
    console.log("Testing command invocation delivery to bot...");

    await reset_bot_server();

    // Send the command
    await send_command(page);

    // Wait for bot to receive the invocation
    const invocation = await wait_for_command_invocation();

    // Verify invocation structure
    assert.equal(invocation.type, "command_invocation", "Should be command_invocation type");
    assert.equal(invocation.command, "testcmd", "Command name should match");
    assert.equal(invocation.arguments["message"], "hello world", "Message argument should match");
    assert.equal(invocation.arguments["count"], "3", "Count argument should match");
    assert.ok(invocation.interaction_id, "Should have interaction_id");
    assert.ok(invocation.user, "Should have user info");

    console.log("Command invocation delivery test passed!");
}

async function test_command_invocation_widget(page: Page): Promise<void> {
    console.log("Testing command invocation widget renders...");

    // Wait for the widget to appear in the message stream
    await page.waitForSelector(".widget-command-invocation", {visible: true, timeout: 10000});

    // Verify widget content
    const widget = await page.$(".widget-command-invocation");
    assert.ok(widget, "Command invocation widget should exist");

    // Check command name is displayed
    const widget_text = await page.$eval(".widget-command-invocation", (el) => el.textContent);
    assert.ok(widget_text?.includes("testcmd"), "Widget should show command name");

    console.log("Command invocation widget test passed!");
}

// ============ Main Test Runner ============

async function bot_command_invocation_test(page: Page): Promise<void> {
    // Verify test bot server is available
    try {
        const health_response = await fetch(`${BOT_SERVER_URL}/control/health`);
        if (!health_response.ok) {
            throw new Error("Bot server not healthy");
        }
    } catch (error) {
        console.error(
            "Test bot server is not available. Run with --with-queue-worker flag to start it.",
        );
        throw error;
    }

    console.log(`Test bot server available at ${BOT_SERVER_URL}`);

    // Log in
    await common.log_in(page);

    // Create a webhook bot pointing to our test server
    await navigate_to_settings_bots(page);
    const bot = await create_webhook_bot(
        page,
        "Command Test Bot",
        "command-test",
        BOT_SERVER_URL,
    );
    console.log(`Created webhook bot with user_id: ${bot.user_id}, email: ${bot.email}`);

    // Run tests in sequence (they build on each other)
    await test_command_registration_and_typeahead(page, bot);
    await test_command_mode_entry(page);
    await test_argument_input_and_navigation(page);
    await test_command_invocation_delivery(page);
    await test_command_invocation_widget(page);

    console.log("All bot command invocation e2e tests passed!");
}

await common.run_test(bot_command_invocation_test);
