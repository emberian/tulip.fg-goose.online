import $ from "jquery";

import * as compose_state from "./compose_state.ts";
import * as input_pill from "./input_pill.ts";
import type {User} from "./people.ts";
import * as people from "./people.ts";
import * as pill_typeahead from "./pill_typeahead.ts";
import type {CombinedPill, CombinedPillContainer} from "./typeahead_helper.ts";
import * as user_group_pill from "./user_group_pill.ts";
import * as user_groups from "./user_groups.ts";
import type {UserGroup} from "./user_groups.ts";
import * as user_pill from "./user_pill.ts";

export let widget: CombinedPillContainer | undefined;

function create_item_from_text(
    text: string,
    current_items: CombinedPill[],
): CombinedPill | undefined {
    // Try user groups first, then users
    const funcs = [
        user_group_pill.create_item_from_group_name,
        user_pill.create_item_from_user_id,
    ];
    for (const func of funcs) {
        const item = func(text, current_items);
        if (item) {
            return item;
        }
    }
    return undefined;
}

function get_text_from_item(item: CombinedPill): string {
    if (item.type === "user_group") {
        return user_group_pill.get_group_name_from_item(item);
    }
    if (item.type === "user") {
        return user_pill.get_unique_full_name_from_item(item);
    }
    return "";
}

function get_display_value_from_item(item: CombinedPill): string {
    if (item.type === "user_group") {
        const group = user_groups.maybe_get_user_group_from_id(item.group_id);
        if (group) {
            return user_groups.get_display_group_name(group.name);
        }
        return "";
    }
    if (item.type === "user") {
        return user_pill.get_display_value_from_item(item);
    }
    return "";
}

function generate_pill_html(item: CombinedPill): string {
    if (item.type === "user_group") {
        return user_group_pill.generate_pill_html(item);
    }
    if (item.type === "user") {
        return user_pill.generate_pill_html(item);
    }
    return "";
}

export function initialize_pill(): CombinedPillContainer {
    const $container = $("#whisper_recipient").parent();

    const pill = input_pill.create<CombinedPill>({
        $container,
        create_item_from_text,
        get_text_from_item,
        get_display_value_from_item,
        generate_pill_html,
        show_outline_on_invalid_input: true,
    });

    return pill;
}

function get_users(): User[] {
    const all_users = people.get_realm_users();
    if (!widget) {
        return all_users;
    }
    return user_pill.filter_taken_users(all_users, widget);
}

function get_groups(): UserGroup[] {
    let groups = user_groups.get_realm_user_groups();
    groups = groups.filter((item) => item.name !== "role:nobody");
    if (!widget) {
        return groups;
    }
    return user_group_pill.filter_taken_groups(groups, widget);
}

function update_compose_state(): void {
    if (!widget) {
        return;
    }

    const user_ids = user_pill.get_user_ids(widget);
    const group_ids = user_group_pill.get_group_ids(widget);

    compose_state.set_whisper_recipients(user_ids, group_ids);
}

export function initialize({
    on_pill_create_or_remove,
}: {
    on_pill_create_or_remove: () => void;
}): void {
    widget = initialize_pill();

    // Set up typeahead for users and groups
    const $pill_container = $("#whisper_recipient").parent();
    pill_typeahead.set_up_combined($pill_container.find(".input"), widget, {
        user_source: get_users,
        user_group_source: get_groups,
        stream: false,
        user_group: true,
        user: true,
        for_stream_subscribers: false,
    });

    widget.onPillCreate(() => {
        update_compose_state();
        on_pill_create_or_remove();
        $("#whisper_recipient").trigger("focus");
    });

    widget.onPillRemove(() => {
        update_compose_state();
        on_pill_create_or_remove();
    });
}

export function clear(): void {
    if (widget) {
        widget.clear();
    }
    compose_state.set_whisper_recipients([], []);
}

export function get_user_ids(): number[] {
    if (!widget) {
        return [];
    }
    return user_pill.get_user_ids(widget);
}

export function get_group_ids(): number[] {
    if (!widget) {
        return [];
    }
    return user_group_pill.get_group_ids(widget);
}

export function has_recipients(): boolean {
    if (!widget) {
        return false;
    }
    return widget.items().length > 0;
}

export function set_from_user_ids(user_ids: number[]): void {
    if (!widget) {
        return;
    }
    for (const user_id of user_ids) {
        const person = people.maybe_get_user_by_id(user_id);
        if (person) {
            user_pill.append_person({
                pill_widget: widget,
                person,
            });
        }
    }
}

export function set_from_group_ids(group_ids: number[]): void {
    if (!widget) {
        return;
    }
    for (const group_id of group_ids) {
        const group = user_groups.maybe_get_user_group_from_id(group_id);
        if (group) {
            user_group_pill.append_user_group(group, widget);
        }
    }
}

export function set_from_user_and_group_ids(user_ids: number[], group_ids: number[]): void {
    if (!widget) {
        return;
    }
    // Clear existing pills first
    widget.clear();
    // Add users
    set_from_user_ids(user_ids);
    // Add groups
    set_from_group_ids(group_ids);
    // Update compose state
    compose_state.set_whisper_recipients(user_ids, group_ids);
}
