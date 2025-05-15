import express from "express";
import requestIp from "request-ip";
import bodyParser from "body-parser";
import { WebSocket, WebSocketServer, RawData } from "ws";
import "dotenv/config";
import Joi from "joi";
import { SubscriptionManager } from "./SubscriptionManager";

// Ensure required environment variables are set
const {
	HOST,
	PORT,
	WSPORT,
	ALLOWED_BROADCASTING_SERVER_IPS,
	PROTOCOL = "http",
	CLEANUP_INTERVAL_MS = "60000",
	MAX_INACTIVE_TIME_MS = "3600000",
	MAX_PAYLOAD_SIZE_MB = "10",
} = process.env;

if (!HOST || !PORT || !WSPORT || !ALLOWED_BROADCASTING_SERVER_IPS) {
	throw new Error("Missing required environment variables.");
}

const app = express();
const router = express.Router();
const wss = new WebSocketServer({
	port: parseInt(WSPORT),
	maxPayload: parseInt(MAX_PAYLOAD_SIZE_MB) * 1024 * 1024, // Convert MB to bytes
	perMessageDeflate: {
		zlibDeflateOptions: {
			level: 6, // Balanced compression
		},
	},
});

// Initialize subscription manager
const subscriptionManager = new SubscriptionManager(
	parseInt(CLEANUP_INTERVAL_MS),
	parseInt(MAX_INACTIVE_TIME_MS)
);

// Message validation schema
const messageSchema = Joi.object({
	appKey: Joi.string().required(),
	channel: Joi.string().required(),
	event: Joi.string()
		.pattern(/^[a-zA-Z0-9\\._]+$/) // Allow letters, numbers, backslashes, and dots
		.required()
		.messages({
			"string.pattern.base":
				"Event name can only contain letters, numbers, backslashes, and dots",
		}),
}).unknown(true);

// Handle WebSocket connections
wss.on("connection", (ws: WebSocket, req) => {
	let connectionInfo = {
		appKey: "",
		channel: "",
		event: "",
	};

	ws.on("message", (message: RawData) => {
		try {
			// Convert message from Buffer if necessary
			const messageStr = Buffer.isBuffer(message)
				? message.toString()
				: message instanceof ArrayBuffer
				? Buffer.from(message).toString()
				: message.toString();

			const parsedMessage = JSON.parse(messageStr);

			// Validate message format
			const { error, value } = messageSchema.validate(parsedMessage);

			// Normalize event name by replacing backslashes with dots
			// This converts "App\Events\UserUpdatedEvent" to "App.Events.UserUpdatedEvent"
			value.event = value.event.replace(/\\/g, ".");

			if (error) {
				ws.send(JSON.stringify({ error: error.details[0].message }));
				return;
			}

			console.log({ value });

			const { appKey, channel, event } = value;

			connectionInfo = { appKey, channel, event };

			// Add subscription and update activity
			subscriptionManager.addSubscription(appKey, event, channel, ws);

			subscriptionManager.updateActivity(appKey, event, channel, ws);
		} catch (error) {
			console.error("Invalid WebSocket message:", error);
			ws.send(JSON.stringify({ error: "Invalid message format" }));
		}
	});

	ws.on("close", () => {
		const { appKey, event, channel } = connectionInfo;
		if (appKey && event && channel) {
			subscriptionManager.removeSubscription(appKey, event, channel, ws);
		}
	});

	ws.on("error", (error) => {
		console.error("WebSocket error:", error);
	});
});

// Middleware to handle IP filtering
router.use((req, res, next) => {
	const clientIp = requestIp.getClientIp(req);

	const blacklistedIps =
		process.env.BLACKLISTED_BROADCASTING_SERVER_IPS?.split(",") || [];
	if (blacklistedIps.includes(clientIp || "")) {
		return res.status(401).json({ error: "Connection is blacklisted!" });
	}

	const allowedIps = ALLOWED_BROADCASTING_SERVER_IPS.split(",");
	if (
		ALLOWED_BROADCASTING_SERVER_IPS === "*" ||
		allowedIps.includes("*") ||
		allowedIps.includes(clientIp || "")
	) {
		return next();
	}

	return res.status(401).json({ error: "Connection not whitelisted!" });
});

// Request validation schema
const broadcastSchema = Joi.object({
	channel: Joi.alternatives(
		Joi.string(),
		Joi.array().items(Joi.string())
	).required(),
	appKey: Joi.string().required(),
	data: Joi.any().required(),
	event: Joi.string().required(),
});

// Handle broadcasting messages
router.post("/", (req, res) => {
	const { error, value } = broadcastSchema.validate(req.body);

	if (error) {
		return res.status(400).json({ error: error.details[0].message });
	}

	const { channel, appKey, data, event } = value;

	const sendMessages = (channel: string, data: any, event: string) => {
		if (!appKey || !event || !channel) {
			console.error(
				"Invalid parameters: appKey, event, or channel is missing!"
			);
			return;
		}

		const subscribers = subscriptionManager.getSubscriptions(
			appKey,
			event,
			channel
		);

		if (!subscribers.length) {
			console.error(
				`No subscriptions found for appKey: "${appKey}", event: "${event}", channel: "${channel}"`
			);
			return;
		}

		const { socket, ...filteredData } = data;
		const messageStr = JSON.stringify({
			event,
			channel,
			data: filteredData,
			socket,
		});

		subscribers.forEach(({ ws }) => {
			if (ws.readyState === WebSocket.OPEN) {
				ws.send(messageStr);
			}
		});
	};

	if (Array.isArray(channel)) {
		channel.forEach((ch) => sendMessages(ch, data, event));
	} else {
		sendMessages(channel, data, event);
	}

	return res.sendStatus(200);
});

// Use JSON parser with size limits
app.use(bodyParser.json({ limit: `${MAX_PAYLOAD_SIZE_MB}mb` }));
app.use(requestIp.mw());
app.use("/", router);

// Graceful shutdown handling
const gracefulShutdown = () => {
	console.log("Shutting down gracefully...");

	// Close all WebSocket connections
	wss.clients.forEach((client) => {
		client.close(1000, "Server shutting down");
	});

	// Cleanup subscription manager
	subscriptionManager.destroy();

	// Close WebSocket server
	wss.close(() => {
		console.log("WebSocket server closed");
		process.exit(0);
	});
};

process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);

// Start servers
app.listen(PORT, () => {
	console.log(`HTTP server is running on ${PROTOCOL}://${HOST}:${PORT}`);
});

console.log(
	`WebSocket server is running on ${
		PROTOCOL === "http" ? "ws" : "wss"
	}://${HOST}:${WSPORT}`
);
