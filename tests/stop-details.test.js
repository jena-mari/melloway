import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stopOpeningHours, stopDirections } from '../src/utils/stopDetails.js';
const prefs = {date:'2026-10-12'}; // Monday, independently of the host timezone.
const base = {arrival:660,source:'curated',lat:-33.87,lng:151.2};
test('stop hours use the visit day, including an outing crossing midnight',()=>{
  const weeklyHours=Array.from({length:7},()=>[]);
  weeklyHours[1]=[{open:540,close:1320}]; weeklyHours[2]=[{open:600,close:1440}];
  assert.match(stopOpeningHours({...base,weeklyHours},prefs),/^9:00 am–10:00 pm/);
  assert.match(stopOpeningHours({...base,weeklyHours,arrival:2100},prefs),/^10:00 am–12:00 am next day/);
});
test('overnight service remains visible when the new day has no opening window',()=>{
  const weeklyHours=Array.from({length:7},()=>[]); weeklyHours[1]=[{open:1080,close:1560}];
  assert.match(stopOpeningHours({...base,weeklyHours,arrival:1500},prefs),/^until 2:00 am · overnight from previous day/);
  assert.equal(stopOpeningHours({...base,weeklyHours,arrival:1620},prefs),'Closed on this date');
});
test('dated closures override regular hours, and missing hours remain unconfirmed',()=>{
  assert.equal(stopOpeningHours({...base,hours:{open:540,close:1320},closedDates:[prefs.date]},prefs),'Closed on this date');
  assert.equal(stopOpeningHours(base,prefs),'Hours unconfirmed · check with venue');
  assert.equal(stopOpeningHours({...base,weeklyHours:Array.from({length:7},()=>[])},prefs),'Closed on this date');
});
test('sample hours are labelled and multiple daily windows stay distinct',()=>{
  const weeklyHours=Array.from({length:7},()=>[{open:600,close:840},{open:1080,close:1320}]);
  assert.equal(stopOpeningHours({...base,source:'demo',weeklyHours},prefs),'10:00 am–2:00 pm, 6:00 pm–10:00 pm · sample hours');
});
test('stop directions navigate from the user’s location and retain the exact Google branch',()=>{
  const url=new URL(stopDirections({...base,id:'branch-id',source:'google'},'Walking'));
  assert.equal(url.pathname,'/maps/dir/'); assert.equal(url.searchParams.get('origin'),null);
  assert.equal(url.searchParams.get('destination'),'-33.87,151.2');
  assert.equal(url.searchParams.get('destination_place_id'),'branch-id');
  assert.equal(url.searchParams.get('travelmode'),'walking');
});
test('stop directions respect transport choices without inventing Google IDs for other sources',()=>{
  for(const [transport,mode] of [['Not selected',null],['Driving','driving'],['Public transport','transit']]) {
    const url=new URL(stopDirections({...base,id:'curated-id'},transport));
    assert.equal(url.searchParams.get('travelmode'),mode);
    assert.equal(url.searchParams.get('destination_place_id'),null);
  }
});
