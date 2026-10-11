// Offline Google Maps SDK substitute. No Google requests or real keys are used.
export const googleMapsFixture = String.raw`
(() => {
  class LatLng {
    constructor(lat, lng) { this._lat = lat; this._lng = lng; }
    lat() { return this._lat; } lng() { return this._lng; }
  }
  class LatLngBounds {
    constructor() { this.points = []; }
    extend(point) { this.points.push(point); return this; }
  }
  class FakeMap {
    constructor(element, options) {
      this.element = element; this.zoom = options.zoom; this.center = options.center;
      this.listeners = new Map(); this.markers = new Set();
      this.surface = document.createElement('div');
      this.surface.style.cssText = 'position:relative;width:100%;height:100%;background:#f3f1e9;overflow:hidden';
      this.surface.innerHTML = '<div style="position:absolute;inset:0;background:repeating-linear-gradient(30deg,transparent 0 42px,#fff 44px 50px,transparent 52px 92px)"></div><span style="position:absolute;bottom:3px;left:5px;font:10px sans-serif;color:#777">Google Maps · offline fixture</span>';
      element.append(this.surface);
      if (options.zoomControl) ['Zoom in','Zoom out'].forEach((name,index) => {
        const button = document.createElement('button'); button.type = 'button';
        button.setAttribute('aria-label',name); button.textContent = index ? '−' : '+';
        button.style.cssText = 'position:absolute;right:8px;bottom:'+ (24+index*44) +'px;width:44px;height:44px;background:white;border:1px solid #ddd;z-index:2';
        button.onclick = () => this.setZoom(this.zoom + (index ? -1 : 1)); this.surface.append(button);
      });
      this.scheduleIdle();
    }
    addListener(name, fn) { const list = this.listeners.get(name) || new Set(); list.add(fn); this.listeners.set(name,list); return { remove: () => list.delete(fn) }; }
    emit(name) { this.listeners.get(name)?.forEach(fn => fn()); }
    scheduleIdle() { clearTimeout(this.timer); this.timer = setTimeout(() => this.emit('idle'),20); }
    fitBounds(bounds, padding) {
      this.element.dataset.fittedPoints = JSON.stringify(bounds.points);
      this.element.dataset.fitPadding = JSON.stringify(padding);
      this.element.dataset.fitCount = String(Number(this.element.dataset.fitCount || 0) + 1);
      this.bounds = bounds.points;
      this.center = {lat:bounds.points.reduce((sum,p)=>sum+p.lat,0)/bounds.points.length,lng:bounds.points.reduce((sum,p)=>sum+p.lng,0)/bounds.points.length};
      this.setZoom(13); this.render(); this.scheduleIdle();
    }
    setCenter(center) { this.center = center; this.bounds = null; this.element.dataset.centerLat = center.lat; this.element.dataset.centerLng = center.lng; this.render(); this.scheduleIdle(); }
    panTo(center) { this.setCenter(center); }
    getCenter() { return new LatLng(this.center.lat, this.center.lng); }
    moveCamera({ center, zoom }) {
      this.element.dataset.cameraMoves = String(Number(this.element.dataset.cameraMoves || 0) + 1);
      this.setZoom(zoom); this.setCenter(center);
    }
    setZoom(zoom) { if (zoom !== this.zoom) { this.zoom = zoom; this.emit('zoom_changed'); } this.render(); this.scheduleIdle(); }
    getZoom() { return this.zoom; }
    getProjection() { return { fromLatLngToPoint: p => ({ x:(p.lng()+180)/360*256, y:(90-p.lat())/180*256 }) }; }
    render() {
      const width = this.surface.clientWidth, height = this.surface.clientHeight;
      const lats = (this.bounds || []).map(p=>p.lat), lngs = (this.bounds || []).map(p=>p.lng);
      const latRange = this.bounds ? Math.max(.005, Math.max(...lats)-Math.min(...lats))*1.8 : .009;
      const lngRange = this.bounds ? Math.max(.005, Math.max(...lngs)-Math.min(...lngs))*1.8 : .011;
      this.markers.forEach(marker => {
        const x = width/2+(marker.position.lng-this.center.lng)/lngRange*width;
        const y = height/2-(marker.position.lat-this.center.lat)/latRange*height;
        marker.wrapper.style.left = Math.max(45,Math.min(width-45,x))+'px';
        marker.wrapper.style.top = Math.max(65,Math.min(height-55,y))+'px';
      });
    }
  }
  class AdvancedMarkerElement {
    constructor(options) {
      this.position = options.position; this.content = options.content || document.createElement('button');
      if (!options.content) { this.content.type = 'button'; this.content.setAttribute('aria-label', options.title); }
      this.wrapper = document.createElement('div');
      this.wrapper.style.cssText = 'position:absolute;transform:translate(-50%,-100%)';
      this.wrapper.append(this.content); this.map = options.map;
    }
    append(node) { this.content.append(node); }
    addListener(name, fn) { this.content.addEventListener(name, fn); return { remove: () => this.content.removeEventListener(name, fn) }; }
    set map(map) { if (this.current) this.current.markers.delete(this); this.wrapper.remove(); this.current = map; if(map) { map.markers.add(this); map.surface.append(this.wrapper); map.render(); } }
    get map() { return this.current; }
    set zIndex(z) { this.wrapper.style.zIndex = z; }
  }
  class PinElement { constructor(options) { const pin = document.createElement('span'); pin.textContent = options.glyphText; return pin; } }
  class Polyline { constructor(options) { this.map = options.map; } setMap(map) { this.map = map; } }
  // Match the real SDK: coordinates belong to core, not the maps library.
  const maps = { Map:FakeMap, Polyline };
  const core = { LatLng, LatLngBounds };
  window.google = { maps: { ...maps, ...core, marker:{AdvancedMarkerElement,PinElement}, event: { clearInstanceListeners(map) { clearTimeout(map.timer); map.listeners.clear(); } },
    async importLibrary(name) {
      if (name === 'maps') return maps;
      if (name === 'core') return core;
      if (name === 'marker') return {AdvancedMarkerElement,PinElement};
      throw new Error('Unexpected Maps library: '+name);
    }
  }};
  const script = [...document.scripts].find(s => s.src.includes('maps.googleapis.com/maps/api/js'));
  const callback = new URL(script.src).searchParams.get('callback');
  window[callback]();
})();
`;
