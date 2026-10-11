import { useId, useState } from "react";
import { EmbeddedPreview } from "./VenueSocial.jsx";
import { addHack48Image, addHack48Reel, sharedMediaUrl } from "../services/hack48.js";

export default function Hack48Media({ event, onChange }) {
  const id = useId();
  const [code, setCode] = useState(""), [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [failed, setFailed] = useState(false);
  async function save(operation) {
    setBusy(true); setMessage(""); setFailed(false);
    try { onChange(await operation()); setUrl(""); setMessage("Added to the shared event."); }
    catch (error) { setFailed(true); setMessage(error.message || "Couldn't save the attachment. Please try again."); }
    finally { setBusy(false); }
  }
  return <section className="hack48-media" aria-label="Hack48 images and Reels">
    <h3>images & Reels</h3>
    <p className="events-preview-note">Shared with people connected to this server. Refresh to see new uploads. QR access and comments come later.</p>
    {!event.attachments.length && <p>No images or Reels yet.</p>}
    <div className="hack48-gallery">
      {event.attachments.map(item => item.kind === "image"
        ? <a key={item.id} href={sharedMediaUrl(item.url)} target="_blank" rel="noopener noreferrer">
          <img src={sharedMediaUrl(item.url)} alt="Image shared for Hack48" loading="lazy" />
        </a>
        : <div key={item.id} className="hack48-reel">
          <EmbeddedPreview post={{ url: item.url, platform: "Instagram", id: item.postId }} />
          <a href={item.url} target="_blank" rel="noopener noreferrer">open original Instagram Reel ↗</a>
          <p className="events-preview-note">Preview unavailable? Use the original link.</p>
        </div>)}
    </div>
    <details className="event-more-details">
      <summary>add images or a Reel</summary>
      <p>Only the organiser edit code allows uploads.</p>
      <label htmlFor={`${id}-code`}>organiser edit code</label>
      <input id={`${id}-code`} type="password" autoComplete="off" value={code} onChange={e => setCode(e.target.value)} disabled={busy} />
      <label htmlFor={`${id}-image`}>upload an image · JPEG, PNG or WebP · up to 1.5 MB</label>
      <input id={`${id}-image`} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy || !code}
        onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; if (file) save(() => addHack48Image(file, code)); }} />
      <form onSubmit={e => { e.preventDefault(); save(() => addHack48Reel(url, code)); }}>
        <label htmlFor={`${id}-reel`}>Instagram Reel link</label>
        <input id={`${id}-reel`} type="url" placeholder="https://www.instagram.com/reel/…/" value={url} onChange={e => setUrl(e.target.value)} disabled={busy} />
        <button type="submit" className="text-button" disabled={busy || !url.trim() || !code}>{busy ? "saving…" : "add Reel"}</button>
      </form>
      {message && <p role={failed ? "alert" : "status"}>{message}</p>}
    </details>
  </section>;
}
