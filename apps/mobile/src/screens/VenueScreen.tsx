import { useEffect, useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { venues } from '@melloway/domain';
import { Screen } from '../components/Screen';
import { Button, MoodImage, Notice } from '../components/UI';
import { useAppStore } from '../store/useAppStore';
import { common } from '../theme';
import { useVenueVideoStore } from '../store/useVenueVideoStore';
import { videosForVenue } from '../services/venueVideos';
import { SocialLinkForm } from './SocialLinkScreen';
import SocialVideoPreview from '../components/SocialVideoPreview';

export default function VenueScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const plan = useAppStore(state => state.current?.plan);
  const setStatus = useAppStore(state => state.setStatus);
  const [addingVideo, setAddingVideo] = useState<string | null>(null);
  const videos = useVenueVideoStore(state => state.videos);
  const load = useVenueVideoStore(state => state.load);
  const hydrated = useVenueVideoStore(state => state.hydrated);
  const loadError = useVenueVideoStore(state => state.loadError);
  useEffect(() => { void load().catch(() => {}); }, [load]);
  const venue = plan?.stops.find(v => v.id === id) || venues.find(v => v.id === id);
  if (!venue) return <Screen><Text style={common.title}>that spot has wandered off.</Text><Button label="back to ur day" onPress={() => router.replace('/itinerary')} /></Screen>;
  return <Screen eyebrow="LOCATION SPOTLIGHT">
    <MoodImage uri={venue.image} source={venue.source} attribution={venue.attribution} height={280} />
    <Text accessibilityRole="header" style={common.title}>{venue.name}</Text>
    <Text style={common.subtitle}>{venue.address}</Text>
    <Notice>{venue.source === 'demo' ? 'Demo venue · illustrative mood imagery · sample hours and prices.' : `Google Places${venue.attribution ? ' · Photo: ' + venue.attribution : ''}`}</Notice>
    <Text style={common.text}>{venue.note}</Text>
    {venues.some(demo => demo.id === venue.id && demo.source === 'demo') && venue.source === 'demo' && <>
      <Notice>Device-local prototype videos. These are your own place associations, not public community publishing or secure admin moderation.</Notice>
      {!!loadError && <>
        <Text accessibilityRole="alert" style={common.error}>{loadError}</Text>
        <Button label="Retry loading videos" tone="cream" onPress={() => { void load().catch(() => {}); }} />
      </>}
      {!hydrated && !loadError && <Text style={common.fine}>Loading videos saved on this device…</Text>}
      {addingVideo === venue.id
        ? <SocialLinkForm key={venue.id} venueId={venue.id} onCancel={() => setAddingVideo(null)}
          onSaved={() => setAddingVideo(null)} />
        : <Button label="Add video" tone="green" disabled={!hydrated} onPress={() => setAddingVideo(venue.id)} />}
      {hydrated && <Text accessibilityRole="header" style={common.label}>Videos saved for this venue</Text>}
      {hydrated && !videosForVenue(videos, venue.id).length && <Text style={common.fine}>No videos saved for this venue yet.</Text>}
      {videosForVenue(videos, venue.id).map(video => <View key={`${video.platform}:${video.postId}`} testID="saved-venue-video" style={common.card}>
        <Text style={common.fine}>Saved on this device · {video.savedAt}</Text>
        <SocialVideoPreview video={{ platform: video.platform, id: video.postId, normalizedUrl: video.normalizedUrl }} />
        <Text selectable style={common.fine}>{video.normalizedUrl}</Text>
      </View>)}
    </>}
    <View style={common.card}>
      <Text style={common.label}>estimated spend</Text><Text style={common.text}>${venue.cost} AUD per person · planning allowance</Text>
      <Text style={common.label}>make a little time</Text><Text style={common.text}>{venue.mins} minutes</Text>
      <Text style={common.label}>why it might be ur vibe</Text><Text style={common.text}>{venue.tags.join(' · ')}</Text>
      <Text style={common.label}>ratings & reviews</Text><Text style={common.fine}>{venue.rating ? `${venue.rating}/5 from Google. Check the venue link for current reviews.` : 'No verified ratings or availability in demo mode.'}</Text>
    </View>
    <Button label="check it on Google Maps ↗" tone="green" onPress={() => {
      Linking.openURL(venue.mapsUri || `https://www.google.com/maps/search/?api=1&query=${venue.lat},${venue.lng}`).catch(() => setStatus('Could not open Google Maps.'));
    }} />
    <Button label="back to ur day" tone="cream" onPress={() => router.back()} />
  </Screen>;
}
