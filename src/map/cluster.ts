import { L } from './leaflet.ts'
import 'leaflet.markercluster'
import 'leaflet.markercluster/dist/MarkerCluster.css'

export function createClusterGroup(): L.MarkerClusterGroup {
  return L.markerClusterGroup({
    showCoverageOnHover: false,
    spiderfyOnMaxZoom: true,
    zoomToBoundsOnClick: true,
    maxClusterRadius: 50,
    chunkedLoading: true,
    iconCreateFunction: (cluster) => {
      const n = cluster.getChildCount()
      const size = n < 10 ? 36 : n < 50 ? 42 : 50
      return L.divIcon({
        html: `<span>${n}</span>`,
        className: 'cluster',
        iconSize: [size, size],
      })
    },
  })
}
