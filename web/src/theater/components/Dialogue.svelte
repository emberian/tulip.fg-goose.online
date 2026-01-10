<script lang="ts">
    import type {TheaterMessage} from "../stores/messages";

    interface Props {
        message: TheaterMessage;
        showSpeaker?: boolean;
        isConsecutive?: boolean;
    }

    let {message, showSpeaker = true, isConsecutive = false}: Props = $props();

    function formatTime(timestamp: number): string {
        const date = new Date(timestamp * 1000);
        return date.toLocaleTimeString([], {hour: "2-digit", minute: "2-digit"});
    }

    function getInitials(name: string): string {
        return name
            .split(" ")
            .map((word) => word[0])
            .join("")
            .toUpperCase()
            .slice(0, 2);
    }
</script>

<article
    class="dialogue"
    class:consecutive={isConsecutive}
    class:whisper={message.isWhisper}
    data-message-id={message.id}
    aria-label="{message.characterName} at {formatTime(message.timestamp)}{message.isWhisper ? ', whisper ' + message.whisperRecipientsText : ''}"
>
    {#if showSpeaker && !isConsecutive}
        <header class="dialogue-header">
            {#if message.characterAvatar}
                <img
                    class="character-portrait"
                    src={message.characterAvatar}
                    alt=""
                    aria-hidden="true"
                />
            {:else}
                <div class="character-portrait-placeholder" aria-hidden="true">
                    {getInitials(message.characterName)}
                </div>
            {/if}
            <span
                class="speaker-tag"
                style={message.characterColor ? `color: ${message.characterColor}` : ""}
            >
                {message.characterName}
            </span>
            {#if message.isWhisper}
                <span class="whisper-badge" role="note" aria-label="Whisper {message.whisperRecipientsText}">
                    <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        aria-hidden="true"
                    >
                        <path
                            d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"
                        />
                        <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                    <span aria-hidden="true">{message.whisperRecipientsText}</span>
                </span>
            {/if}
        </header>
    {/if}

    <div class="dialogue-content">
        {@html message.rendered_content}
    </div>

    <span class="timestamp" aria-hidden="true">{formatTime(message.timestamp)}</span>
</article>

<style>
    .dialogue {
        position: relative;
        padding: 1rem 1.5rem;
        margin: 0.5rem 0;
    }

    .dialogue.consecutive {
        padding-top: 0.25rem;
        margin-top: 0;
    }

    .dialogue.whisper {
        background: var(--theater-whisper-bg);
        border-left: 3px solid var(--theater-whisper-accent);
        border-radius: 0 8px 8px 0;
    }

    .dialogue-header {
        display: flex;
        align-items: center;
        gap: 1rem;
        margin-bottom: 0.75rem;
    }

    .character-portrait {
        width: var(--theater-portrait-size);
        height: var(--theater-portrait-size);
        border-radius: 50%;
        object-fit: cover;
        border: 2px solid var(--theater-border);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
        flex-shrink: 0;
    }

    .character-portrait-placeholder {
        width: var(--theater-portrait-size);
        height: var(--theater-portrait-size);
        border-radius: 50%;
        background: var(--theater-bg-elevated);
        border: 2px solid var(--theater-border);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.2rem;
        font-weight: 600;
        color: var(--theater-muted);
        flex-shrink: 0;
    }

    .speaker-tag {
        font-family: var(--theater-font-ui);
        font-size: 1.1rem;
        font-weight: 600;
        color: var(--theater-text);
        letter-spacing: 0.02em;
    }

    .whisper-badge {
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
        font-size: 0.75rem;
        color: var(--theater-whisper-accent);
        font-family: var(--theater-font-ui);
        margin-left: auto;
    }

    .dialogue-content {
        font-size: 1.1rem;
        line-height: 1.7;
        color: var(--theater-text);
    }

    /* Rendered markdown adjustments for theatrical feel */
    .dialogue-content :global(p) {
        margin: 0.5em 0;
    }

    .dialogue-content :global(p:first-child) {
        margin-top: 0;
    }

    .dialogue-content :global(p:last-child) {
        margin-bottom: 0;
    }

    .dialogue-content :global(em) {
        color: var(--theater-action-text);
        font-style: italic;
    }

    .dialogue-content :global(a) {
        color: var(--theater-accent);
    }

    .dialogue-content :global(code) {
        background: var(--theater-bg-elevated);
        padding: 0.1em 0.3em;
        border-radius: 3px;
        font-size: 0.9em;
    }

    .timestamp {
        position: absolute;
        right: 1rem;
        top: 0.5rem;
        opacity: 0;
        transition: opacity var(--theater-transition-fast);
        font-size: 0.8rem;
        color: var(--theater-muted);
        font-family: var(--theater-font-ui);
    }

    .dialogue:hover .timestamp {
        opacity: 1;
    }

    /* Mobile optimizations */
    @media (max-width: 768px) {
        .dialogue {
            padding: 0.75rem 1rem;
        }

        .dialogue-header {
            gap: 0.75rem;
            margin-bottom: 0.5rem;
        }

        .character-portrait,
        .character-portrait-placeholder {
            width: 48px;
            height: 48px;
        }

        .character-portrait-placeholder {
            font-size: 1rem;
        }

        .speaker-tag {
            font-size: 1rem;
        }

        .dialogue-content {
            font-size: 1rem;
            line-height: 1.6;
        }

        /* Always show timestamp on mobile (no hover) */
        .timestamp {
            opacity: 0.6;
            font-size: 0.75rem;
        }

        .whisper-badge {
            font-size: 0.7rem;
        }
    }
</style>
