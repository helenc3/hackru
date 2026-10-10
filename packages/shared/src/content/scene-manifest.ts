import { SceneManifestSchema } from '../contracts.js';

// Segment-004 can decorate this district, but these coordinates are shared by
// the server, validation harness, and renderer. Routes remain flat and open.
export const sceneManifest = SceneManifestSchema.parse({
  bounds: { minX: -20, maxX: 20, minZ: -20, maxZ: 20 },
  spawn: { x: 0, z: 10 }, movementSpeed: 4, interactionRadius: 2, playerRadius: 0.35,
  zones: [
    { id: 'plaza', center: { x: 0, z: 10 }, bounds: { minX: -18, maxX: 18, minZ: 2, maxZ: 18 } },
    { id: 'cafe', center: { x: -10, z: 6 }, bounds: { minX: -14, maxX: -6, minZ: 2, maxZ: 8 } },
    { id: 'kiosk', center: { x: 8, z: 5 }, bounds: { minX: 5, maxX: 11, minZ: 2, maxZ: 8 } },
    { id: 'concourse', center: { x: 0, z: 0 }, bounds: { minX: -18, maxX: 18, minZ: -8, maxZ: 2 } },
    { id: 'platform-1', center: { x: -10, z: -12 }, bounds: { minX: -14, maxX: -6, minZ: -16, maxZ: -8 } },
    { id: 'platform-2', center: { x: 0, z: -12 }, bounds: { minX: -4, maxX: 4, minZ: -16, maxZ: -8 } },
    { id: 'platform-3', center: { x: 10, z: -12 }, bounds: { minX: 6, maxX: 14, minZ: -16, maxZ: -8 } },
  ],
  colliders: [
    { id: 'cafe-west-wall', bounds: { minX: -15, maxX: -14.5, minZ: 2, maxZ: 8 } },
    { id: 'cafe-north-wall', bounds: { minX: -14.5, maxX: -6, minZ: 8, maxZ: 8.5 } },
    { id: 'kiosk-counter-back', bounds: { minX: 5, maxX: 11, minZ: 7, maxZ: 7.5 } },
    { id: 'platform-west-edge', bounds: { minX: -16, maxX: -15.5, minZ: -17, maxZ: -9 } },
    { id: 'platform-east-edge', bounds: { minX: 15.5, maxX: 16, minZ: -17, maxZ: -9 } },
  ],
  interactables: [
    { id: 'xiaolin', zoneId: 'cafe', kind: 'npc', label: '小林', position: { x: -10, z: 4 } },
    { id: 'achen', zoneId: 'concourse', kind: 'npc', label: '阿陈', position: { x: -3, z: 0 } },
    { id: 'laozhou', zoneId: 'concourse', kind: 'npc', label: '老周', position: { x: 3, z: 0 } },
    { id: 'p1.entrance-sign', zoneId: 'cafe', kind: 'sign', label: '入口告示', position: { x: -10, z: 6 } },
    { id: 'p1.station-directions', zoneId: 'cafe', kind: 'pa', label: '去车站的路线', position: { x: -10, z: 4 } },
    { id: 'p2.timetable', zoneId: 'concourse', kind: 'sign', label: '列车时刻表', position: { x: -1, z: 0 } },
    { id: 'p2.platform-change', zoneId: 'concourse', kind: 'pa', label: '车站广播', position: { x: 0, z: -2 } },
    { id: 'b1.destination-board', zoneId: 'concourse', kind: 'sign', label: '目的地看板', position: { x: 1, z: 0 } },
    { id: 'b1.harbor-change', zoneId: 'concourse', kind: 'pa', label: '车站广播', position: { x: 0, z: -2 } },
    { id: 'p1.enter-plaza-door', zoneId: 'cafe', kind: 'choice', label: '广场入口', position: { x: -10, z: 6 } },
    { id: 'p1.try-closed-door', zoneId: 'cafe', kind: 'choice', label: '关闭的侧门', position: { x: -14, z: 4 } },
    { id: 'p1.pay-cafe', zoneId: 'cafe', kind: 'choice', label: '付款', position: { x: -10, z: 4 } },
    { id: 'p1.go-kiosk', zoneId: 'kiosk', kind: 'choice', label: '售货亭', position: { x: 8, z: 5 } },
    { id: 'p1.pay-kiosk', zoneId: 'kiosk', kind: 'choice', label: '付款', position: { x: 8, z: 5 } },
    { id: 'p2.board-1', zoneId: 'platform-1', kind: 'choice', label: '一号站台上车', position: { x: -10, z: -12 } },
    { id: 'p2.board-2', zoneId: 'platform-2', kind: 'choice', label: '二号站台上车', position: { x: 0, z: -12 } },
    { id: 'p2.board-3', zoneId: 'platform-3', kind: 'choice', label: '三号站台上车', position: { x: 10, z: -12 } },
    { id: 'b1.pay-ticket', zoneId: 'concourse', kind: 'choice', label: '支付车票', position: { x: 3, z: 0 } },
    { id: 'b1.board-1', zoneId: 'platform-1', kind: 'choice', label: '一号站台上车', position: { x: -10, z: -12 } },
    { id: 'b1.board-2', zoneId: 'platform-2', kind: 'choice', label: '二号站台上车', position: { x: 0, z: -12 } },
    { id: 'b1.board-3', zoneId: 'platform-3', kind: 'choice', label: '三号站台上车', position: { x: 10, z: -12 } },
  ],
});
