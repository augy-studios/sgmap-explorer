// Every layer the map can ask for, by id: /api/layer/<id>. A layer not listed here doesn't
// exist, so the route never reaches an upstream it wasn't written for.

import onemap from "./onemap.js";
import roads from "./roads.js";
import transport from "./transport.js";
import weather from "./weather.js";

export const LAYERS = Object.fromEntries([...transport, ...roads, ...weather, ...onemap].map((l) => [l.id, l]));
