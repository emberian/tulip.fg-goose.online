import $ from "jquery";

import render_my_character_row from "../templates/my_character_row.hbs";
import render_character_form_modal from "../templates/character_form_modal.hbs";

import * as channel from "./channel.ts";
import * as dialog_widget from "./dialog_widget.ts";
import * as ListWidget from "./list_widget.ts";
import type {ListWidget as ListWidgetType} from "./list_widget.ts";
import * as personas from "./personas.ts";
import type {MyPersona} from "./personas.ts";
import * as timerender from "./timerender.ts";

export let loaded = false;

type CharacterItem = {
    id: number;
    name: string;
    name_initial: string;
    avatar_url: string | null;
    color: string | null;
    bio: string;
    date_created: number;
    date_created_str: string;
};

export let list_widget: ListWidgetType<CharacterItem> | undefined;

function format_persona(persona: MyPersona): CharacterItem {
    return {
        id: persona.id,
        name: persona.name,
        name_initial: persona.name.charAt(0).toUpperCase(),
        avatar_url: persona.avatar_url,
        color: persona.color,
        bio: persona.bio,
        date_created: persona.date_created,
        date_created_str: timerender.get_localized_date_or_time_for_format(
            new Date(persona.date_created * 1000),
            "dayofyear_year",
        ),
    };
}

export function populate_list(): void {
    if (!loaded) {
        return;
    }

    const my_personas = personas.get_my_personas();
    const characters = my_personas.map(format_persona);

    const $table = $("#my_characters_table");
    const $parent = $("#my-characters-settings");

    if (list_widget) {
        list_widget.replace_list_data(characters);
        return;
    }

    list_widget = ListWidget.create<CharacterItem>($table, characters, {
        name: "my-characters-list",
        get_item: ListWidget.default_get_item,
        modifier_html(item) {
            return render_my_character_row({persona: item});
        },
        sort_fields: {
            ...ListWidget.generic_sort_functions("alphabetic", ["name"]),
            ...ListWidget.generic_sort_functions("numeric", ["date_created"]),
        },
        $parent_container: $parent,
        $simplebar_container: $parent.find(".progressive-table-wrapper"),
    });
}

function open_add_character_modal(): void {
    const html = render_character_form_modal({
        is_editing: false,
        name: "",
        avatar_url: "",
        color: "#6b7280",
        bio: "",
    });

    dialog_widget.launch({
        html_heading: "Add character",
        html_body: html,
        html_submit_button: "Add",
        on_click: submit_character_form,
        id: "character-form-modal",
        loading_spinner: true,
        form_id: "character-form",
        on_shown: () => $("#character-name").trigger("focus"),
    });
}

function open_edit_character_modal(persona_id: number): void {
    const my_personas = personas.get_my_personas();
    const persona = my_personas.find((p) => p.id === persona_id);
    if (!persona) {
        return;
    }

    const html = render_character_form_modal({
        is_editing: true,
        id: persona.id,
        name: persona.name,
        avatar_url: persona.avatar_url ?? "",
        color: persona.color ?? "#6b7280",
        bio: persona.bio,
    });

    dialog_widget.launch({
        html_heading: "Edit character",
        html_body: html,
        html_submit_button: "Save",
        on_click: submit_character_form,
        id: "character-form-modal",
        loading_spinner: true,
        form_id: "character-form",
        on_shown: () => $("#character-name").trigger("focus"),
    });
}

function submit_character_form(): void {
    const $form = $("#character-form");
    const name = $form.find("#character-name").val() as string;
    const avatar_url = ($form.find("#character-avatar-url").val() as string) || null;
    const color_input = $form.find("#character-color").val() as string;
    const color = color_input && color_input !== "#6b7280" ? color_input : null;
    const bio = $form.find("#character-bio").val() as string;
    const persona_id = $form.find("#character-id").val() as string;

    const data: Record<string, unknown> = {name, bio};
    if (avatar_url) {
        data.avatar_url = avatar_url;
    }
    if (color) {
        data.color = color;
    }

    if (persona_id) {
        // Update existing persona
        dialog_widget.submit_api_request(
            channel.patch,
            `/json/users/me/personas/${persona_id}`,
            data,
        );
    } else {
        // Create new persona
        dialog_widget.submit_api_request(channel.post, "/json/users/me/personas", data);
    }
}

function delete_character(persona_id: number): void {
    const my_personas = personas.get_my_personas();
    const persona = my_personas.find((p) => p.id === persona_id);
    if (!persona) {
        return;
    }

    dialog_widget.launch({
        html_heading: "Delete character",
        html_body: `<p>Are you sure you want to delete <strong>${persona.name}</strong>?</p><p>Past messages sent as this character will still show their name.</p>`,
        html_submit_button: "Delete",
        on_click() {
            dialog_widget.submit_api_request(
                channel.del,
                `/json/users/me/personas/${persona_id}`,
                {},
            );
        },
        id: "delete-character-modal",
        loading_spinner: true,
    });
}

// Callback for when personas change (via events)
function on_personas_changed(): void {
    if (loaded) {
        populate_list();
    }
}

export function set_up(): void {
    loaded = true;

    // Register callback for persona changes
    personas.register_change_callback(on_personas_changed);

    // Fetch personas and populate list when ready
    personas.fetch_my_personas(populate_list);

    // Add character button
    $("body").on("click", "#add-new-character-button", (e) => {
        e.preventDefault();
        open_add_character_modal();
    });

    // Edit character button
    $("body").on("click", ".edit-character-button", function (e) {
        e.preventDefault();
        const $row = $(this).closest("tr");
        const persona_id = Number.parseInt($row.attr("data-persona-id")!, 10);
        open_edit_character_modal(persona_id);
    });

    // Delete character button
    $("body").on("click", ".delete-character-button", function (e) {
        e.preventDefault();
        const $row = $(this).closest("tr");
        const persona_id = Number.parseInt($row.attr("data-persona-id")!, 10);
        delete_character(persona_id);
    });

    // Clear color button in modal
    $("body").on("click", ".clear-color-button", function (e) {
        e.preventDefault();
        $(this).siblings("#character-color").val("#6b7280");
    });
}

export function reset(): void {
    loaded = false;
    list_widget = undefined;
    personas.unregister_change_callback(on_personas_changed);
}
