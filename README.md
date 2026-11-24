# Sydney Bot

Discord application-command bot for Cloudflare Workers. It uses signed Discord interactions, a Durable Object for session voting, and Discord REST for moderation and announcements.

## Commands
- /promote: opens a modal for a heading and announcement text, then publishes a branded embed.
- /user: changes a member's server nickname (callsigns).
- /startup target: creates a one-vote-per-member session poll. Reaching the target updates the poll and posts the active-session announcement.
- /shutdown: posts a shutdown announcement.
- /kick, /ban, /mute, /warn: staff moderation. Warnings are sent by DM.

## Worker secrets and variables
Configure these in Cloudflare. Keep credentials out of GitHub.
- DISCORD_PUBLIC_KEY: Application public key.
- DISCORD_BOT_TOKEN: Bot token (secret).
- STAFF_ROLE_IDS: comma-separated staff role IDs. Server administrators are also allowed.
- GUILD_ID: Discord server ID.
- GENERAL_CHANNEL_ID: welcome channel.
- PROMOTIONS_CHANNEL_ID: promotion channel.
- ANNOUNCEMENTS_CHANNEL_ID: shutdown channel.
- SESSION_CHANNEL_ID: session vote and active announcement channel. If omitted, the command channel is used.
- BRAND_LOGO_URL: public HTTPS logo URL.
- BRAND_BANNER_URL: public HTTPS banner URL.
- JOIN_WEBHOOK_SECRET: long random secret for the optional join relay.

The Durable Object binding SESSIONS and SessionCoordinator migration are declared in wrangler.toml.

## Discord setup
1. Create an application and bot in the Discord Developer Portal.
2. Set the Interactions Endpoint URL to the deployed Worker URL, ending in /.
3. Invite the bot with Manage Nicknames, Kick Members, Ban Members, Moderate Members, Send Messages and Embed Links. Ensure its role is above members it must manage.
4. Give it access to the relevant channels.
5. Run the command registration script after setting DISCORD_BOT_TOKEN, DISCORD_APPLICATION_ID and DISCORD_GUILD_ID in your local environment: npm run register.

## Welcome messages
Discord member-join notifications are Gateway events, not interaction callbacks. This Worker includes a protected relay endpoint at POST /events/member-join. A small always-on Discord Gateway relay must call it with:
Authorization: Bearer JOIN_WEBHOOK_SECRET
JSON body: { "guild_id": "SERVER_ID", "user_id": "MEMBER_ID", "username": "Display name", "member_count": 123 }

Until that relay is connected, configure Discord's built-in welcome system or leave automated welcomes disabled. The Worker cannot receive Gateway events on its own.

## Notes
- /mute uses Discord's native timeout and is limited to 28 days.
- /warn cannot DM members who have server DMs disabled; the command will report an error.
- /user changes the server nickname, not the global Discord username.
- The logo and banner URLs must be publicly accessible HTTPS links.
