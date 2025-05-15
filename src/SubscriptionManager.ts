import { WebSocket } from "ws";

export interface Subscription {
	ws: WebSocket;
	timestamp: number;
	lastActivity: number;
}

const subscriptions: Record<
	string,
	Record<string, Record<string, Subscription[]>>
> = {};

export class SubscriptionManager {
	// private subscriptions: Record<
	// 	string,
	// 	Record<string, Record<string, Subscription[]>>
	// > = {};
	private readonly maxInactiveTime: number;
	private cleanupInterval: NodeJS.Timeout;

	constructor(
		cleanupIntervalMs: number = 60000,
		maxInactiveTimeMs: number = 3600000
	) {
		this.maxInactiveTime = maxInactiveTimeMs;
		this.cleanupInterval = setInterval(
			() => this.cleanup(),
			cleanupIntervalMs
		);
	}

	public addSubscription(
		appKey: string,
		event: string,
		channel: string,
		ws: WebSocket
	): void {
		if (!subscriptions[appKey]) {
			subscriptions[appKey] = {};
		}

		if (!subscriptions[appKey][event]) {
			subscriptions[appKey][event] = {};
		}

		if (!subscriptions[appKey][event][channel]) {
			subscriptions[appKey][event][channel] = [];
		}

		const subscription: Subscription = {
			ws,
			timestamp: Date.now(),
			lastActivity: Date.now(),
		};

		subscriptions[appKey][event][channel].push(subscription);
	}

	public removeSubscription(
		appKey: string,
		event: string,
		channel: string,
		ws: WebSocket
	): void {
		if (!subscriptions[appKey]?.[event]?.[channel]) return;

		subscriptions[appKey][event][channel] = subscriptions[appKey][event][
			channel
		].filter((sub) => sub.ws !== ws);

		this.cleanupEmptyPaths(appKey, event, channel);
	}

	public getSubscriptions(
		appKey: string,
		event: string,
		channel: string
	): Subscription[] {
		let sub = subscriptions[appKey]?.[event]?.[channel] || [];

		console.log(subscriptions);

		return sub;
	}

	public updateActivity(
		appKey: string,
		event: string,
		channel: string,
		ws: WebSocket
	): void {
		const subs = this.getSubscriptions(appKey, event, channel);
		const sub = subs.find((s) => s.ws === ws);
		if (sub) {
			sub.lastActivity = Date.now();
		}
	}

	private cleanup(): void {
		const now = Date.now();

		Object.keys(subscriptions).forEach((appKey) => {
			Object.keys(subscriptions[appKey]).forEach((event) => {
				Object.keys(subscriptions[appKey][event]).forEach((channel) => {
					subscriptions[appKey][event][channel] = subscriptions[
						appKey
					][event][channel].filter((sub) => {
						const isActive =
							now - sub.lastActivity < this.maxInactiveTime;
						const isConnected =
							sub.ws.readyState === WebSocket.OPEN;
						return isActive && isConnected;
					});

					this.cleanupEmptyPaths(appKey, event, channel);
				});
			});
		});
	}

	private cleanupEmptyPaths(
		appKey: string,
		event: string,
		channel: string
	): void {
		if (subscriptions[appKey]?.[event]?.[channel]?.length === 0) {
			delete subscriptions[appKey][event][channel];
		}

		if (Object.keys(subscriptions[appKey]?.[event] || {}).length === 0) {
			delete subscriptions[appKey][event];
		}

		if (Object.keys(subscriptions[appKey] || {}).length === 0) {
			delete subscriptions[appKey];
		}
	}

	public destroy(): void {
		if (this.cleanupInterval) {
			clearInterval(this.cleanupInterval);
		}
	}
}
