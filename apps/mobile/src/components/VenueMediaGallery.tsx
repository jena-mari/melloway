import { useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { inferSocialContext, mediaVenueKey, publicMedia, type Venue, type VenueMedia } from '@melloway/domain';
import { venueMediaClient } from '../services/venueMedia';
import SocialVideoPlayer from './SocialVideoPlayer';
import { Button, Field } from './UI';
import { colors, common } from '../theme';

export default function VenueMediaGallery({ venue }: { venue: Venue }) {
  const [selected, setSelected] = useState<VenueMedia | null>(null), [failed, setFailed] = useState(false), [error, setError] = useState('');
  const [adding, setAdding] = useState(false), [url, setUrl] = useState(''), [confirmed, setConfirmed] = useState(false), [saving, setSaving] = useState(false);
  const queryClient = useQueryClient(), identity = mediaVenueKey(venue), linkKey = `melloway.mobile.media.${identity}`;
  const query = useQuery({ queryKey: ['venue-media', mediaVenueKey(venue)],
    queryFn: ({ signal }) => venueMediaClient.discover(venue, signal), enabled: venue.source !== 'demo', staleTime: 6 * 3600000, retry: false });
  const links = useQuery({ queryKey: ['venue-media-links', identity], queryFn: async () => {
    const value = JSON.parse(await AsyncStorage.getItem(linkKey) || '[]');
    if (!Array.isArray(value)) throw new Error('Couldn’t load saved post links.');
    return [...new Set(value.filter(link => publicMedia(link)).map(link => publicMedia(link)!.url))].slice(0, 12);
  } });
  const previews = useQuery({ queryKey: ['venue-media-previews', links.data], enabled: !!links.data?.length,
    queryFn: () => Promise.all((links.data || []).map(link => venueMediaClient.preview(link))), staleTime: 6 * 3600000 });
  const posts = [...new Map([...(previews.data || []), ...(query.data || [])].map(post => [post.url, post])).values()];
  const context = inferSocialContext(venue, posts);
  async function open(url: string) { try { await Linking.openURL(url); } catch { setError('Couldn’t open the original post.'); } }
  async function addLink() {
    const post = publicMedia(url.trim());
    if (!post) { setError('Use a TikTok video or Instagram post link.'); return; }
    if (!confirmed) { setError('Confirm this shows the exact place and branch.'); return; }
    if (!links.isSuccess) { setError('Wait for saved links to load, or retry.'); return; }
    const next = [...new Set([...links.data, post.url])];
    if (next.length > 12) { setError('Up to 12 shared posts per place.'); return; }
    setSaving(true); setError('');
    try {
      await AsyncStorage.setItem(linkKey, JSON.stringify(next));
      queryClient.setQueryData(['venue-media-links', identity], next);
      setUrl(''); setConfirmed(false); setAdding(false);
    } catch { setError('Couldn’t save this link. Try again.'); }
    finally { setSaving(false); }
  }
  async function removeLink(value: string) {
    setSaving(true);
    try {
      const next = (links.data || []).filter(link => link !== value);
      await AsyncStorage.setItem(linkKey, JSON.stringify(next));
      queryClient.setQueryData(['venue-media-links', identity], next);
    } catch { setError('Couldn’t remove this link. Try again.'); }
    finally { setSaving(false); }
  }
  return <View style={styles.section}>
    <Text accessibilityRole="header" style={common.label}>see the vibe</Text>
    <Button label="add a post" tone="cream" onPress={() => { setAdding(!adding); setError(''); }} />
    {links.isError && <Button label="retry post links" tone="cream" onPress={() => { void links.refetch(); }} />}
    {adding && <View style={styles.section}>
      <Field label="post link" value={url} onChangeText={value => { setUrl(value); setConfirmed(false); }} autoCapitalize="none" keyboardType="url" />
      <Pressable accessibilityRole="checkbox" accessibilityLabel="This post shows this exact place and branch" accessibilityState={{ checked: confirmed }}
        onPress={() => setConfirmed(!confirmed)} style={styles.confirm}>
        <Text style={common.fine}>{confirmed ? '☑' : '□'} This shows {venue.name} at {venue.address}.</Text>
      </Pressable>
      <Text style={common.fine}>Your link stays on this device.</Text>
      <Button label="save post link" tone="green" busy={saving} onPress={() => { void addLink(); }} />
    </View>}
    {query.isFetching && <View accessibilityLiveRegion="polite" style={common.row}><ActivityIndicator color={colors.ink} /><Text style={common.fine}>finding posts…</Text></View>}
    {query.isError && <><Text accessibilityRole="alert" style={common.fine}>Post search is unavailable right now.</Text><Button label="retry posts" tone="cream" onPress={() => { void query.refetch(); }} /></>}
    {!query.isFetching && !posts.length && !query.isError && <Text style={common.fine}>{venue.source === 'demo' ? 'Demo place · no associated public posts.' : 'No confirmed public posts for this branch yet.'}</Text>}
    {posts.length > 0 && <ScrollView horizontal showsHorizontalScrollIndicator accessibilityLabel="Posts at this spot" contentContainerStyle={styles.rail}>
      {posts.map(post => <View key={post.url} style={styles.card}>
        {post.thumbnail ? <Image source={{ uri: post.thumbnail }} style={styles.thumbnail} accessibilityLabel={`${post.platform} post preview`} /> : <View style={styles.placeholder}><Text style={common.script}>{post.platform}</Text></View>}
        <Text numberOfLines={3} style={common.fine}>{post.caption || `${post.platform} post`}</Text>
        {!!post.creator && <Text style={common.fine}>{post.creator}</Text>}
        <Button label={`watch ${post.platform} post`} tone="cream" onPress={() => { setSelected(post); setFailed(false); }} />
        <Button label={`original on ${post.platform}`} tone="cream" onPress={() => { void open(post.url); }} />
        {links.data?.includes(post.url) && <Button label={`remove shared ${post.platform} post`} tone="cream" disabled={saving} onPress={() => { void removeLink(post.url); }} />}
      </View>)}
    </ScrollView>}
    {!!context.atmosphere.length && <Text style={common.fine}>From captions · {context.atmosphere.join(' · ')} (inferred)</Text>}
    {selected && <View style={styles.section}>
      <Button label="close post" tone="cream" onPress={() => setSelected(null)} />
      {failed ? <Text style={common.fine}>Preview unavailable. Open the original post.</Text> : <View style={styles.player}>
        <SocialVideoPlayer title={`${selected.platform} post`} onError={() => setFailed(true)}
          uri={selected.platform === 'TikTok' ? `https://www.tiktok.com/player/v1/${selected.id}?autoplay=0` : `${selected.url}embed/`} />
      </View>}
      <Button label={`open on ${selected.platform}`} tone="green" onPress={() => { void open(selected.url); }} />
    </View>}
    {!!error && <Text accessibilityRole="alert" style={common.error}>{error}</Text>}
  </View>;
}
const styles = StyleSheet.create({
  section: { gap: 12 }, rail: { gap: 12, paddingBottom: 8 }, card: { width: 240, gap: 10 },
  thumbnail: { width: '100%', height: 280, borderRadius: 14 },
  placeholder: { height: 280, borderRadius: 14, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  player: { height: 500, width: '100%', borderRadius: 14, overflow: 'hidden' },
  confirm: { minHeight: 44, justifyContent: 'center', paddingVertical: 8 },
});
