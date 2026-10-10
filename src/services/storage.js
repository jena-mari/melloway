import {createClient} from '@supabase/supabase-js';
const url=import.meta.env.VITE_SUPABASE_URL,key=import.meta.env.VITE_SUPABASE_ANON_KEY;
const cloud=url&&key?createClient(url,key):null;
export function readLocal(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}}
export function writeLocal(key,value){localStorage.setItem(key,JSON.stringify(value));}
async function user(){const {data:{session}}=await cloud.auth.getSession();if(session)return session.user;const {data,error}=await cloud.auth.signInAnonymously();if(error)throw error;return data.user;}
export async function saveCloud(plan){if(!cloud)return false;const u=await user();const {error}=await cloud.from('itineraries').upsert({id:plan.id,user_id:u.id,plan});if(error)throw error;return true;}
export async function loadCloud(){if(!cloud)return [];const u=await user();const {data,error}=await cloud.from('itineraries').select('plan').eq('user_id',u.id);if(error)throw error;return data.map(row=>row.plan);}
export async function deleteCloud(id){if(!cloud)return;await user();const {error}=await cloud.from('itineraries').delete().eq('id',id);if(error)throw error;}
