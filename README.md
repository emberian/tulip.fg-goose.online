# Tulip

Tulip is a fork of [Zulip](https://github.com/zulip/zulip) with enhanced bot capabilities, rich interactive widgets, and additional features for building immersive chat experiences.

## Changes from Upstream Zulip

This fork introduces several new features not present in the upstream Zulip project:

### Bot Extensibility System

A comprehensive system for building interactive bots with rich UI capabilities.

#### Rich Widgets

Bots can send messages with embedded interactive UI elements:

- **Rich Embeds** - Discord-style embeds with titles, fields, images, and colored borders
- **Interactive Widgets** - Buttons, select menus, and modals that trigger bot interactions
- **Freeform Widgets** - Custom HTML/CSS/JS widgets for trusted bots (with external dependency support)

#### Bot Commands

Bots can register slash commands that appear in the compose box typeahead with autocomplete support. Users can type `/command` and see suggestions from registered bots.

#### Bot Interactions

When users interact with widgets (clicking buttons, selecting options, submitting modals), events are delivered to bots via webhooks or the embedded bot handler. Bots can respond with:

- Public messages
- Ephemeral responses (visible only to the interacting user)
- Private responses (visible to specific users)
- New widgets

See [ADVANCED_BOTS.md](./ADVANCED_BOTS.md) for complete documentation.

### Bot Presence

Bots now have presence tracking, displayed in the sidebar:

- **Automatic tracking**: Bots with active event queues are automatically shown as online
- **Manual API**: Webhook bots can explicitly update their presence via `/api/v1/bots/me/presence`
- **Sidebar display**: Connected bots appear with green indicators; disconnected bots show when they were last seen

### Puppets (Stream Personas)

Streams can enable "puppet mode" which allows users to send messages as custom personas:

- Users can create character identities with custom names and avatars
- Messages sent as puppets show the puppet name/avatar but are attributed to the real user
- Typeahead suggests previously used puppets in the stream
- Recent view shows puppet information alongside real sender

Enable puppet mode per-stream in stream settings.

### Inline Spoilers

New markdown syntax for inline spoiler text:

```
This text is visible ||but this is hidden until clicked||.
```

Inline spoilers appear as clickable "spoiler" badges that reveal the hidden text when clicked.

### User Group Colors

User groups can now have associated colors, which can be used for visual distinction in mentions and group displays.

### Profile Change Notifications

Users receive private messages from Notification Bot when their profile is modified:

- Full name changes
- Role changes
- Custom profile field updates

This covers both administrator-initiated changes and system changes (LDAP sync, management commands).

## Database Schema Changes

The following database migrations have been added:

| Migration | Description |
|-----------|-------------|
| `0773_add_color_to_user_groups` | Adds `color` field to UserGroup model |
| `0774_add_stream_puppet_mode` | Adds `enable_puppet_mode` field to Stream model |
| `0775_add_message_puppet_fields` | Adds puppet fields to Message model |
| `0776_add_stream_puppet_model` | Adds StreamPuppet model for tracking puppets |

## New Models

### BotPresence

Tracks the connection status of bots:

```python
class BotPresence(models.Model):
    bot = models.OneToOneField(UserProfile, ...)
    realm = models.ForeignKey(Realm, ...)
    is_connected = models.BooleanField(default=False)
    last_connected_time = models.DateTimeField(null=True)
```

### BotCommand

Stores slash commands registered by bots:

```python
class BotCommand(models.Model):
    bot_profile = models.ForeignKey(UserProfile, ...)
    realm = models.ForeignKey(Realm, ...)
    name = models.CharField(max_length=32)
    description = models.TextField(max_length=100)
    options_schema = models.JSONField(default=list)
```

### StreamPuppet

Tracks puppet personas used in streams (created during message sending).

## New API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/json/bot_interactions` | POST | Handle widget interactions |
| `/json/bot_commands` | GET | List registered bot commands |
| `/json/bot_commands/register` | POST | Register a new bot command |
| `/json/bot_commands/{id}` | DELETE | Delete a bot command |
| `/json/bot_commands/{bot_id}/autocomplete` | GET | Fetch dynamic autocomplete |
| `/api/v1/bots/me/presence` | POST | Update bot presence status |
| `/json/streams/{id}/puppets` | GET | List puppets used in a stream |

## New Event Types

| Event Type | Description |
|------------|-------------|
| `bot_presence` | Bot connection status changed |
| `bot_commands` | Bot commands added/removed/updated |

## New Queue Workers

### bot_interactions

Processes interaction events from widgets and delivers them to bots:

- Outgoing webhook bots receive HTTP POST to their configured URL
- Embedded bots receive calls to their `handle_interaction()` method

## Frontend Changes

### New TypeScript Modules

- `bot_presence.ts` - Client-side bot presence tracking
- `stream_puppets.ts` - Stream puppet management and caching
- `freeform_widget.ts` - Freeform widget rendering with dependency loading
- `interactive_widget.ts` - Interactive widget (buttons, menus) handling
- `bot_modal.ts` - Bot-triggered modal dialogs

### Buddy List (Sidebar)

The right sidebar now includes a "Bots" section showing bot presence status with online/offline indicators.

### Compose Box

- Typeahead now suggests bot commands (`/command`)
- Dynamic autocomplete fetches suggestions from bots in real-time
- Puppet mode typeahead for puppet-enabled streams

### Spoiler Rendering

Added support for inline spoilers in rendered markdown with click-to-reveal functionality.

## Testing

New test files added:

- `test_bot_presence.py` - Bot presence API and event tests
- `test_bot_interactions.py` - Bot interaction worker and widget tests
- `test_puppets.py` - Puppet mode tests
- `test_widgets.py` - Widget rendering tests
- `bot-presence.test.ts` - E2E tests for bot presence in sidebar
- `advanced-bot-widgets.test.ts` - E2E tests for interactive widgets

## Configuration

No new configuration settings are required. All features use existing Zulip configuration patterns.

## Compatibility

This fork maintains compatibility with Zulip clients and APIs. The new features are additive and don't break existing functionality.

## License

Same as upstream Zulip - Apache 2.0 License.
