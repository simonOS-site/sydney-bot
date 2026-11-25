const API = "https://discord.com/api/v10";
const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
const ephemeral = content => ({ type: 4, data: { content, flags: 64, allowed_mentions: { parse: [] } } });

function hexBytes(hex) {
  if (!/^[0-9a-f]{128}$/i.test(hex || "")) throw new Error("Invalid public key");
  return Uint8Array.from(hex.match(/.{2}/g), x => parseInt(x, 16));
}
function base64Bytes(value) {
  const raw = atob(value); return Uint8Array.from(raw, c => c.charCodeAt(0));
}
async function verify(request, body, publicKey) {
  try {
    const sig = request.headers.get("x-signature-ed25519");
    const timestamp = request.headers.get("x-signature-timestamp");
    if (!sig || !timestamp || !publicKey) return false;
    const key = await crypto.subtle.importKey("raw", hexBytes(publicKey), { name: "Ed25519" }, false, ["verify"]);
    return crypto.subtle.verify({ name: "Ed25519" }, key, base64Bytes(sig), new TextEncoder().encode(timestamp + body));
  } catch { return false; }
}
async function discord(env, path, method = "GET", body) {
  const res = await fetch(API + path, {
    method, headers: { Authorization: "Bot " + env.DISCORD_BOT_TOKEN, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const raw = await res.text();
  const data = raw ? JSON.parse(raw) : null;
  if (!res.ok) throw new Error(data?.message || "Discord API error " + res.status);
  return data;
}
function brand(title, description, env, color = 0x17365d) {
  return {
    title, description, color, timestamp: new Date().toISOString(), footer: { text: "Sydney Roleplay" },
    ...(env.BRAND_LOGO_URL ? { thumbnail: { url: env.BRAND_LOGO_URL } } : {}),
    ...(env.BRAND_BANNER_URL ? { image: { url: env.BRAND_BANNER_URL } } : {})
  };
}
function opts(interaction) {
  return Object.fromEntries((interaction.data?.options || []).map(o => [o.name, o]));
}
function staffAllowed(interaction, env) {
  const perms = BigInt(interaction.member?.permissions || "0");
  if ((perms & 8n) === 8n) return true;
  const roles = interaction.member?.roles || [];
  const allowed = (env.STAFF_ROLE_IDS || "").split(",").map(x => x.trim()).filter(Boolean);
  return allowed.length > 0 && roles.some(role => allowed.includes(role));
}
async function post(env, channel, payload) {
  if (!channel) throw new Error("Destination channel is not configured");
  return discord(env, "/channels/" + channel + "/messages", "POST", payload);
}
function modalFields(interaction) {
  const result = {};
  for (const row of interaction.data?.components || []) for (const c of row.components || []) result[c.custom_id] = c.value || "";
  return result;
}

async function command(interaction, env) {
  const name = interaction.data.name, o = opts(interaction), guild = interaction.guild_id;
  if (!guild) return ephemeral("Use this command inside the server.");
  if (!staffAllowed(interaction, env)) return ephemeral("You don't have permission to use this command.");

  if (name === "promote") return {
    type: 9, data: { custom_id: "promotion_modal", title: "Promotion announcement", components: [
      { type: 1, components: [{ type: 4, custom_id: "heading", label: "Announcement heading", style: 1, min_length: 3, max_length: 100, required: true, placeholder: "Promotion announcement" }] },
      { type: 1, components: [{ type: 4, custom_id: "message", label: "Announcement text", style: 2, min_length: 5, max_length: 4000, required: true, placeholder: "Write the announcement..." }] }
    ]}
  };

  if (name === "user") {
    const id = o.member?.value, nick = String(o.nickname?.value || "").trim();
    if (!id || !nick || nick.length > 32) return ephemeral("Choose a member and a nickname of up to 32 characters.");
    await discord(env, "/guilds/" + guild + "/members/" + id, "PATCH", { nick });
    return ephemeral("Updated <@" + id + ">'s server nickname to **" + nick.replace(/[*_~]/g, "") + "**.");
  }

  if (name === "startup") {
    const target = Number(o.target?.value);
    if (!Number.isInteger(target) || target < 1 || target > 1000) return ephemeral("Vote target must be between 1 and 1000.");
    if (!env.SESSIONS) return ephemeral("Session voting storage is not configured.");
    const sessionId = crypto.randomUUID(), channel = env.SESSION_CHANNEL_ID || interaction.channel_id;
    const message = await post(env, channel, {
      embeds: [brand("SESSION START-UP VOTE", "A session is being proposed for Sydney Roleplay.\n\n**Votes:** 0 / " + target + "\n**Target:** " + target + "\n\nVote below if you can attend.", env)],
      components: [{ type: 1, components: [{ type: 2, style: 3, label: "Vote to start", custom_id: "startup_vote:" + sessionId }] }],
      allowed_mentions: { parse: [] }
    });
    const stub = env.SESSIONS.get(env.SESSIONS.idFromName(sessionId));
    const init = await stub.fetch("https://session.internal/init", { method: "POST", body: JSON.stringify({ sessionId, guild, channel, messageId: message.id, target }) });
    if (!init.ok) {
      await discord(env, "/channels/" + channel + "/messages/" + message.id, "DELETE").catch(() => {});
      throw new Error("Could not initialise session vote");
    }
    return ephemeral("Startup vote posted. Target: **" + target + "** votes.");
  }

  if (name === "shutdown") {
    const text = String(o.message?.value || "The current Sydney Roleplay session has concluded. Thank you to everyone who attended.");
    await post(env, env.ANNOUNCEMENTS_CHANNEL_ID || interaction.channel_id, { embeds: [brand("SESSION SHUTDOWN", text, env)], allowed_mentions: { parse: [] } });
    return ephemeral("Shutdown announcement posted.");
  }

  if (["kick", "ban", "mute", "warn"].includes(name)) {
    const id = o.member?.value, reason = String(o.reason?.value || "No reason provided.").slice(0, 400);
    if (!id) return ephemeral("Select a member.");
    if (name === "warn") {
      const dm = await discord(env, "/users/@me/channels", "POST", { recipient_id: id });
      await discord(env, "/channels/" + dm.id + "/messages", "POST", {
        embeds: [{ title: "Staff warning", description: "You have received a warning in Sydney Roleplay.\n\n**Reason:** " + reason + "\n\nPlease review the server rules.", color: 0xd69e2e, ...(env.BRAND_LOGO_URL ? { thumbnail: { url: env.BRAND_LOGO_URL } } : {}) }],
        allowed_mentions: { parse: [] }
      });
      return ephemeral("Warning DM sent to <@" + id + ">.");
    }
    if (name === "kick") {
      await discord(env, "/guilds/" + guild + "/members/" + id + "?reason=" + encodeURIComponent(reason), "DELETE");
      return ephemeral("<@" + id + "> has been kicked. Reason: " + reason);
    }
    if (name === "ban") {
      await discord(env, "/guilds/" + guild + "/bans/" + id, "PUT", { reason, delete_message_seconds: 0 });
      return ephemeral("<@" + id + "> has been banned. Reason: " + reason);
    }
    const minutes = Number(o.minutes?.value || 10);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 40320) return ephemeral("Mute duration must be 1 to 40,320 minutes (28 days).");
    await discord(env, "/guilds/" + guild + "/members/" + id, "PATCH", { communication_disabled_until: new Date(Date.now() + minutes * 60000).toISOString() });
    return ephemeral("<@" + id + "> has been timed out for " + minutes + " minutes. Reason: " + reason);
  }
  return ephemeral("Unknown command.");
}

async function modal(interaction, env) {
  if (interaction.data.custom_id !== "promotion_modal") return ephemeral("Unknown form.");
  if (!staffAllowed(interaction, env)) return ephemeral("You don't have permission to publish promotions.");
  const f = modalFields(interaction), heading = (f.heading || "Promotion announcement").trim(), message = (f.message || "").trim();
  if (!message) return ephemeral("Announcement text cannot be empty.");
  await post(env, env.PROMOTIONS_CHANNEL_ID || interaction.channel_id, { embeds: [brand(heading, message, env)], allowed_mentions: { parse: [] } });
  return ephemeral("Promotion announcement published.");
}

async function component(interaction, env) {
  const custom = interaction.data.custom_id || "";
  if (!custom.startsWith("startup_vote:")) return ephemeral("Unknown button.");
  if (!env.SESSIONS) return ephemeral("Voting storage is not configured.");
  const sessionId = custom.slice("startup_vote:".length);
  const stub = env.SESSIONS.get(env.SESSIONS.idFromName(sessionId));
  const res = await stub.fetch("https://session.internal/vote", {
    method: "POST", body: JSON.stringify({ userId: interaction.member?.user?.id || interaction.user?.id })
  });
  const result = await res.json();
  return ephemeral(result.message || result.error || "Vote processed.");
}

async function joinRelay(request, env) {
  if (!env.JOIN_WEBHOOK_SECRET) return reply({ error: "Join relay is not configured." }, 503);
  const encoder = new TextEncoder(), expected = "Bearer " + env.JOIN_WEBHOOK_SECRET, supplied = request.headers.get("authorization") || "";
  const [a, b] = await Promise.all([crypto.subtle.digest("SHA-256", encoder.encode(supplied)), crypto.subtle.digest("SHA-256", encoder.encode(expected))]);
  const digestA = new Uint8Array(a), digestB = new Uint8Array(b);
  let difference = 0;
  for (let i = 0; i < digestA.length; i++) difference |= digestA[i] ^ digestB[i];
  if (difference !== 0) return reply({ error: "Unauthorized" }, 401);
  const p = await request.json();
  if (p.guild_id !== env.GUILD_ID || !p.user_id) return reply({ error: "Invalid join event." }, 400);
  const count = Number.isInteger(p.member_count) ? "\n\nYou're member **#" + p.member_count + "**." : "";
  await post(env, env.GENERAL_CHANNEL_ID, {
    embeds: [brand("WELCOME TO SYDNEY ROLEPLAY", "Welcome <@" + p.user_id + ">! We're glad you're here." + count + "\n\nPlease read the server information and rules before joining a session.", env)],
    allowed_mentions: { users: [String(p.user_id)] }
  });
  return reply({ ok: true });
}

export class SessionCoordinator {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; }
  async fetch(request) {
    if (request.method !== "POST") return reply({ error: "Method not allowed" }, 405);
    const url = new URL(request.url), p = await request.json();
    if (url.pathname === "/init") {
      if (!p.messageId || !p.channel || !Number.isInteger(p.target)) return reply({ error: "Invalid session" }, 400);
      await this.ctx.storage.put("session", { ...p, votes: [], completed: false });
      return reply({ ok: true });
    }
    if (url.pathname !== "/vote") return reply({ error: "Not found" }, 404);
    const s = await this.ctx.storage.get("session");
    if (!s) return reply({ error: "This vote is no longer active." }, 404);
    if (s.completed) return reply({ message: "This session is already active." });
    if (!p.userId) return reply({ error: "Could not identify your account." }, 400);
    if (s.votes.includes(p.userId)) return reply({ message: "Your vote has already been counted." });
    s.votes.push(p.userId);
    const count = s.votes.length, reached = count >= s.target;
    s.completed = reached;
    await this.ctx.storage.put("session", s);
    const headers = { Authorization: "Bot " + this.env.DISCORD_BOT_TOKEN, "Content-Type": "application/json" };
    const embed = {
      title: reached ? "SESSION ACTIVE" : "SESSION START-UP VOTE",
      description: reached ? "The vote target has been reached: **" + count + " / " + s.target + "**.\n\n**Join up Sydney! Session is active!**" : "A session is being proposed for Sydney Roleplay.\n\n**Votes:** " + count + " / " + s.target + "\n**Target:** " + s.target + "\n\nVote below if you can attend.",
      color: reached ? 0x2e8b57 : 0x17365d, timestamp: new Date().toISOString(), footer: { text: "Sydney Roleplay" },
      ...(this.env.BRAND_LOGO_URL ? { thumbnail: { url: this.env.BRAND_LOGO_URL } } : {}),
      ...(this.env.BRAND_BANNER_URL ? { image: { url: this.env.BRAND_BANNER_URL } } : {})
    };
    const edit = await fetch(API + "/channels/" + s.channel + "/messages/" + s.messageId, {
      method: "PATCH", headers, body: JSON.stringify({
        embeds: [embed],
        components: reached ? [] : [{ type: 1, components: [{ type: 2, style: 3, label: "Vote to start", custom_id: "startup_vote:" + s.sessionId }] }],
        allowed_mentions: { parse: [] }
      })
    });
    if (!edit.ok) console.error("Vote message update failed:", edit.status);
    if (reached) {
      const announcement = await fetch(API + "/channels/" + s.channel + "/messages", {
        method: "POST", headers, body: JSON.stringify({ embeds: [brand("SESSION ACTIVE", "**Join up Sydney! Session is active!**", this.env, 0x2e8b57)], allowed_mentions: { parse: [] } })
      });
      if (!announcement.ok) console.error("Session active announcement failed:", announcement.status);
    }
    return reply({ message: reached ? "Vote counted. The target has been reached and the session is active." : "Vote counted: " + count + " / " + s.target + "." });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") return reply({ ok: true, service: "sydney-bot" });
    if (url.pathname === "/events/member-join" && request.method === "POST") {
      try { return await joinRelay(request, env); }
      catch (e) { console.error("Join relay failed:", e); return reply({ error: "Could not process join event." }, 500); }
    }
    if (request.method !== "POST" || url.pathname !== "/") return reply({ error: "Not found" }, 404);
    const body = await request.text();
    if (!(await verify(request, body, env.DISCORD_PUBLIC_KEY))) return reply({ error: "Invalid request signature" }, 401);
    let interaction;
    try { interaction = JSON.parse(body); } catch { return reply({ error: "Invalid JSON" }, 400); }
    if (interaction.type === 1) return reply({ type: 1 });
    try {
      let result;
      if (interaction.type === 2) result = await command(interaction, env);
      else if (interaction.type === 3) result = await component(interaction, env);
      else if (interaction.type === 5) result = await modal(interaction, env);
      else result = ephemeral("Unsupported interaction.");
      return reply(result);
    } catch (e) {
      console.error(JSON.stringify({ event: "interaction_error", message: e instanceof Error ? e.message : "Unknown error", command: interaction.data?.name || interaction.data?.custom_id || "unknown" }));
      return reply(ephemeral("Something went wrong. Check the bot configuration and permissions."));
    }
  }
};
