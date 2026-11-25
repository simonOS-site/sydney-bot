const API = "https://discord.com/api/v10";
const token = process.env.DISCORD_BOT_TOKEN;
const appId = process.env.DISCORD_APPLICATION_ID;
if (!token || !appId) {
  console.error("Set DISCORD_BOT_TOKEN and DISCORD_APPLICATION_ID.");
  process.exit(1);
}
const member = { type: 6, name: "member", description: "Server member", required: true };
const reason = { type: 3, name: "reason", description: "Reason for this action", required: false, max_length: 400 };
const commands = [
  { name: "promote", description: "Create a professional promotion announcement", options: [{ type: 7, name: "channel", description: "Where to post the announcement", required: true, channel_types: [0, 5] }] },
  { name: "user", description: "Change a member's server nickname or callsign", options: [member, { type: 3, name: "nickname", description: "New server nickname", required: true, max_length: 32 }] },
  { name: "startup", description: "Start a session start-up vote", options: [{ type: 4, name: "target", description: "Votes required", required: true, min_value: 1, max_value: 1000 }] },
  { name: "shutdown", description: "Post a session shutdown announcement", options: [{ type: 3, name: "message", description: "Optional shutdown message", required: false, max_length: 1500 }] },
  { name: "kick", description: "Kick a member", options: [member, reason] },
  { name: "ban", description: "Ban a member", options: [member, reason] },
  { name: "mute", description: "Timeout a member", options: [member, { type: 4, name: "minutes", description: "Duration in minutes (1 to 40320)", required: false, min_value: 1, max_value: 40320 }, reason] },
  { name: "warn", description: "Privately warn a member by DM", options: [member, reason] }
];
const securedCommands = commands.map(command => ({ ...command, default_member_permissions: "8" }));
const response = await fetch(API + "/applications/" + appId + "/commands", {
  method: "PUT", headers: { Authorization: "Bot " + token, "Content-Type": "application/json" }, body: JSON.stringify(securedCommands)
});
const data = await response.json();
if (!response.ok) { console.error(data); process.exit(1); }
console.log("Registered " + data.length + " Sydney bot commands.");
