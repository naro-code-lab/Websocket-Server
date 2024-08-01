import { WebSocket } from "ws";

export interface SubscriptionInterface {
	[key: string]: WebSocket[];
}
