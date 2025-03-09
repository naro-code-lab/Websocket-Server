import { WebSocket } from "ws";

export interface SubscriptionInterface {
	[key: string]: {
		[key: string]: {
			[key: string]: WebSocket[];
		};
	};
}
