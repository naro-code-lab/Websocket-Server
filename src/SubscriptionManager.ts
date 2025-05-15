import { WebSocket } from "ws";

export interface Subscription {
	ws: WebSocket;
	timestamp: number;
	lastActivity: number;
}

export class SubscriptionManager {
	private subscriptions: Record<
		string,
		Record<string, Record<string, Subscription[]>>
	> = {};
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
		if (!this.subscriptions[appKey]) {
			this.subscriptions[appKey] = {};
		}

		if (!this.subscriptions[appKey][event]) {
			this.subscriptions[appKey][event] = {};
		}

		if (!this.subscriptions[appKey][event][channel]) {
			this.subscriptions[appKey][event][channel] = [];
		}

		const subscription: Subscription = {
			ws,
			timestamp: Date.now(),
			lastActivity: Date.now(),
		};

		this.subscriptions[appKey][event][channel].push(subscription);
	}

	public removeSubscription(
		appKey: string,
		event: string,
		channel: string,
		ws: WebSocket
	): void {
		if (!this.subscriptions[appKey]?.[event]?.[channel]) return;

		this.subscriptions[appKey][event][channel] = this.subscriptions[appKey][
			event
		][channel].filter((sub) => sub.ws !== ws);

		this.cleanupEmptyPaths(appKey, event, channel);
	}

	public getSubscriptions(
		appKey: string,
		event: string,
		channel: string
	): Subscription[] {
		let sub = this.subscriptions[appKey]?.[event]?.[channel] || [];

		console.log(sub);

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

		Object.keys(this.subscriptions).forEach((appKey) => {
			Object.keys(this.subscriptions[appKey]).forEach((event) => {
				Object.keys(this.subscriptions[appKey][event]).forEach(
					(channel) => {
						this.subscriptions[appKey][event][channel] =
							this.subscriptions[appKey][event][channel].filter(
								(sub) => {
									const isActive =
										now - sub.lastActivity <
										this.maxInactiveTime;
									const isConnected =
										sub.ws.readyState === WebSocket.OPEN;
									return isActive && isConnected;
								}
							);

						this.cleanupEmptyPaths(appKey, event, channel);
					}
				);
			});
		});
	}

	private cleanupEmptyPaths(
		appKey: string,
		event: string,
		channel: string
	): void {
		if (this.subscriptions[appKey]?.[event]?.[channel]?.length === 0) {
			delete this.subscriptions[appKey][event][channel];
		}

		if (
			Object.keys(this.subscriptions[appKey]?.[event] || {}).length === 0
		) {
			delete this.subscriptions[appKey][event];
		}

		if (Object.keys(this.subscriptions[appKey] || {}).length === 0) {
			delete this.subscriptions[appKey];
		}
	}

	public destroy(): void {
		if (this.cleanupInterval) {
			clearInterval(this.cleanupInterval);
		}
	}
}
