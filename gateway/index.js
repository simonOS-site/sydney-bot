import { Client, GatewayIntentBits } from "discord.js";

const required = ["DISCORD_BOT_TOKEN", "WORKER_URL", "JOIN_WEBHOOK_SECRET"];
for (const name of required) {
  if (!process.env[name]) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
}

const workerUrl = process.env.WORKER_URL.replace(/\/$/, "");
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

client.once("ready", readyClient => {
  console.log(`Sydney Gateway connected as ${readyClient.user.tag}`);
});

client.on("guildMemberAdd", async member => {
  try {
    const response = await fetch(`${workerUrl}/events/member-join`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.JOIN_WEBHOOK_SECRET}`
      },
      body: JSON.stringify({
        guild_id: member.guild.id,
        user_id: member.user.id,
        username: member.user.username,
        member_count: member.guild.memberCount
      })
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error(`Welcome relay failed (${response.status}): ${detail}`);
      return;
    }

    console.log(`Welcome message relayed for ${member.user.tag}`);
  } catch (error) {
    console.error("Could not relay member-join event:", error);
  }
});

client.on("error", error => console.error("Discord client error:", error));
process.on("unhandledRejection", error => console.error("Unhandled rejection:", error));

client.login(process.env.DISCORD_BOT_TOKEN);
