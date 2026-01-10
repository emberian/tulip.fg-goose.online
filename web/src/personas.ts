import * as z from "zod/mini";

import * as channel from "./channel.ts";

// Persona data for typeahead and compose
export type Persona = {
    id: number;
    name: string;
    avatar_url: string | null;
    color: string | null;
    user_id: number;
    user_full_name: string;
};

// Schema for realm personas (for @-mention typeahead)
const realm_personas_response_schema = z.object({
    personas: z.array(
        z.object({
            id: z.number(),
            name: z.string(),
            avatar_url: z.nullable(z.string()),
            color: z.nullable(z.string()),
            user_id: z.number(),
            user_full_name: z.string(),
        }),
    ),
});

// Schema for user's own personas
const my_personas_response_schema = z.object({
    personas: z.array(
        z.object({
            id: z.number(),
            name: z.string(),
            avatar_url: z.nullable(z.string()),
            color: z.nullable(z.string()),
            bio: z.string(),
            is_active: z.boolean(),
            date_created: z.number(),
        }),
    ),
});

export type MyPersona = {
    id: number;
    name: string;
    avatar_url: string | null;
    color: string | null;
    bio: string;
    is_active: boolean;
    date_created: number;
};

// Cache of all personas in realm (for typeahead)
let realm_personas: Persona[] = [];
let realm_personas_fetched = false;
let realm_personas_pending = false;

// Cache of current user's personas (for compose selector)
let my_personas: MyPersona[] = [];
let my_personas_fetched = false;
let my_personas_pending = false;

// Current persona selected for compose (per-stream sticky)
const compose_persona_by_stream: Map<number, number | null> = new Map();
let current_compose_persona_id: number | null = null;

// Callbacks for when personas change
type PersonaChangeCallback = () => void;
const change_callbacks: Set<PersonaChangeCallback> = new Set();

export function register_change_callback(callback: PersonaChangeCallback): void {
    change_callbacks.add(callback);
}

export function unregister_change_callback(callback: PersonaChangeCallback): void {
    change_callbacks.delete(callback);
}

function notify_change(): void {
    for (const callback of change_callbacks) {
        callback();
    }
}

export function get_realm_personas(): Persona[] {
    return realm_personas;
}

export function has_fetched_realm_personas(): boolean {
    return realm_personas_fetched;
}

export function fetch_realm_personas(): void {
    if (realm_personas_fetched || realm_personas_pending) {
        return;
    }

    realm_personas_pending = true;
    void channel.get({
        url: "/json/realm/personas",
        success(raw_data) {
            const data = realm_personas_response_schema.parse(raw_data);
            realm_personas = data.personas;
            realm_personas_fetched = true;
            realm_personas_pending = false;
        },
        error() {
            realm_personas = [];
            realm_personas_fetched = true;
            realm_personas_pending = false;
        },
    });
}

export function get_my_personas(): MyPersona[] {
    return my_personas;
}

export function has_fetched_my_personas(): boolean {
    return my_personas_fetched;
}

export function fetch_my_personas(callback?: () => void): void {
    if (my_personas_fetched) {
        callback?.();
        return;
    }
    if (my_personas_pending) {
        // If already pending, register a one-time callback
        if (callback) {
            const one_time_callback = (): void => {
                callback();
                unregister_change_callback(one_time_callback);
            };
            register_change_callback(one_time_callback);
        }
        return;
    }

    my_personas_pending = true;
    void channel.get({
        url: "/json/users/me/personas",
        success(raw_data) {
            const data = my_personas_response_schema.parse(raw_data);
            my_personas = data.personas;
            my_personas_fetched = true;
            my_personas_pending = false;
            callback?.();
            notify_change();
        },
        error() {
            my_personas = [];
            my_personas_fetched = true;
            my_personas_pending = false;
            callback?.();
        },
    });
}

// Compose persona selection
export function get_compose_persona_id(): number | null {
    return current_compose_persona_id;
}

export function set_compose_persona_id(persona_id: number | null, stream_id?: number): void {
    current_compose_persona_id = persona_id;
    if (stream_id !== undefined) {
        compose_persona_by_stream.set(stream_id, persona_id);
    }
}

export function get_sticky_persona_for_stream(stream_id: number): number | null {
    return compose_persona_by_stream.get(stream_id) ?? null;
}

export function clear_cache(): void {
    realm_personas = [];
    realm_personas_fetched = false;
    my_personas = [];
    my_personas_fetched = false;
    compose_persona_by_stream.clear();
    current_compose_persona_id = null;
}

// Handle persona events
export function handle_persona_event(event: {op: string; persona?: MyPersona; persona_id?: number}): void {
    if (event.op === "add" && event.persona) {
        my_personas.push(event.persona);
        // Also add to realm personas if we've fetched them
        if (realm_personas_fetched) {
            // We'd need user info here - for now, just mark as needing refetch
            realm_personas_fetched = false;
        }
        notify_change();
    } else if (event.op === "update" && event.persona) {
        const index = my_personas.findIndex((p) => p.id === event.persona!.id);
        if (index !== -1) {
            my_personas[index] = event.persona;
        }
        // Mark realm personas as needing refetch
        if (realm_personas_fetched) {
            realm_personas_fetched = false;
        }
        notify_change();
    } else if (event.op === "remove" && event.persona_id) {
        my_personas = my_personas.filter((p) => p.id !== event.persona_id);
        // Clear compose selection if this persona was selected
        if (current_compose_persona_id === event.persona_id) {
            current_compose_persona_id = null;
        }
        // Mark realm personas as needing refetch
        if (realm_personas_fetched) {
            realm_personas_fetched = false;
        }
        notify_change();
    }
}
