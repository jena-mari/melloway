import { useState } from "react";
import { useApp } from "./useApp";
import { readLocal, writeLocal } from "../services/storage";
import { normalisePlanNames } from "../utils/venueNames";
import { createId } from "../utils/id";

export function readPosts() {
  const data = readLocal("melloway.posts", []);
  return Array.isArray(data)
    ? data
        .filter(
          (p) => p && typeof p.id === "string" && typeof p.name === "string",
        )
        .map((p) => (p.plan ? { ...p, plan: normalisePlanNames(p.plan) } : p))
    : [];
}
export function readLikes(key = "melloway.likes") {
  const data = readLocal(key, []);
  return Array.isArray(data) ? data.filter((id) => typeof id === "string") : [];
}
function readReplies() {
  const data = readLocal("melloway.replies", {});
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};
  return Object.fromEntries(
    Object.entries(data)
      .filter(([, items]) => Array.isArray(items))
      .map(([id, items]) => [
        id,
        items.filter(
          (r) =>
            r &&
            [r.id, r.text, r.author, r.handle].every(
              (value) => typeof value === "string",
            ),
        ),
      ]),
  );
}
export function withProfile(post, profile) {
  return profile && !post.sample
    ? {
        ...post,
        author: profile.name,
        handle: profile.handle,
        avatar: profile.avatar,
      }
    : post;
}
export default function useCommunity() {
  const { profile, setStatus } = useApp();
  const [posts, setPosts] = useState(readPosts);
  const [likes, setLikes] = useState(readLikes);
  const [replies, setReplies] = useState(readReplies);
  function store(key, value, setter) {
    try {
      writeLocal(key, value);
      setter(value);
      return true;
    } catch {
      setStatus("Couldn’t save that change. Device storage may be full.");
      return false;
    }
  }
  return {
    posts: posts.map((p) => withProfile(p, profile)),
    likes,
    replies,
    addPost: (post) => store("melloway.posts", [post, ...posts], setPosts),
    like: (id) =>
      store(
        "melloway.likes",
        likes.includes(id)
          ? likes.filter((item) => item !== id)
          : [...likes, id],
        setLikes,
      ),
    reply: (id, text, author, handle) =>
      store(
        "melloway.replies",
        {
          ...replies,
          [id]: [
            ...(replies[id] || []),
            {
              id: createId(),
              text,
              author,
              handle,
              createdAt: new Date().toISOString(),
            },
          ],
        },
        setReplies,
      ),
  };
}
