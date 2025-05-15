import express from "express";
import requestIp from "request-ip";
import bodyParser from "body-parser";
import { WebSocket, WebSocketServer, RawData } from "ws";
import { SubscriptionInterface } from "./types";
import "dotenv/config";
import Joi from "joi";

// Ensure required environment variables are set
const {
	HOST,
	PORT,
	WSPORT,
	ALLOWED_BROADCASTING_SERVER_IPS,
	PROTOCOL = "http",
} = process.env;

if (!HOST || !PORT || !WSPORT || !ALLOWED_BROADCASTING_SERVER_IPS) {
	throw new Error("Missing required environment variables.");
}

const app = express();
const router = express.Router();
const wss = new WebSocketServer({ port: parseInt(WSPORT) });

let subscriptions: SubscriptionInterface = {};

// Handle WebSocket connections
wss.on("connection", (ws: WebSocket, req) => {
	let channel = "";
	let appKey = "";
	let event = "";

	ws.on("message", (message: RawData) => {
		try {
			// Convert message from Buffer if necessary
			const parsedMessage: {
				appKey: string;
				channel: string;
				event: string;
			} = JSON.parse(
				Buffer.isBuffer(message)
					? message.toString()
					: message instanceof ArrayBuffer
					? Buffer.from(message).toString()
					: message.toString()
			);

			// Ensure required fields exist
			if (!parsedMessage.channel) {
				return console.error("Channel is required!");
			}

			if (!parsedMessage.appKey) {
				return console.error("App key is required!");
			}

			if (!parsedMessage.event) {
				return console.error("Event is required!");
			}

			({ appKey, channel, event } = parsedMessage);

			subscriptions = {
				...subscriptions,
				[appKey]: {
					...subscriptions[appKey],
					[event]: {
						...subscriptions[appKey]?.[event],
						[channel]: [
							...(subscriptions[appKey]?.[event]?.[channel] ||
								[]),
							ws,
						],
					},
				},
			};

			// console.log(`Subscribed: AppKey=${appKey}, Event=${event}, Channel=${channel}`);
		} catch (error) {
			console.error("Invalid WebSocket message:", message.toString());
		}
	});

	ws.on("close", () => {
		console.log({ subscriptions_connection: subscriptions });

		if (appKey && event && channel) {
			if (subscriptions[appKey]?.[event]?.[channel]) {
				// Remove the disconnected client
				subscriptions[appKey][event][channel] = subscriptions[appKey][
					event
				][channel].filter((client) => client !== ws);

				// Remove the channel if it's empty
				if (subscriptions[appKey][event][channel].length === 0) {
					delete subscriptions[appKey][event][channel];
				}
			}

			// Remove the event if no channels exist
			if (
				subscriptions[appKey]?.[event] &&
				Object.keys(subscriptions[appKey][event]).length === 0
			) {
				delete subscriptions[appKey][event];
			}

			// Remove the appKey if no events exist
			if (
				subscriptions[appKey] &&
				Object.keys(subscriptions[appKey]).length === 0
			) {
				delete subscriptions[appKey];
			}
		}
	});
});

// Middleware to handle IP filtering
router.use((req, res, next) => {
	const clientIp = requestIp.getClientIp(req);

	const blacklistedIps =
		process.env.BLACKLISTED_BROADCASTING_SERVER_IPS?.split(",") || [];
	if (blacklistedIps.includes(clientIp || "")) {
		return res.status(401).send("Connection is blacklisted!");
	}

	const allowedIps = ALLOWED_BROADCASTING_SERVER_IPS.split(",");
	if (
		ALLOWED_BROADCASTING_SERVER_IPS === "*" ||
		allowedIps.includes("*") ||
		allowedIps.includes(clientIp || "")
	) {
		return next();
	}

	return res.status(401).send("Connection not whitelisted!");
});

// Handle broadcasting messages
router.post("/", (req, res) => {
	const {
		channel,
		appKey,
		data,
		event,
	}: {
		channel: string | string[];
		appKey: string;
		data: any;
		event: string;
	} = req.body;

	const schema = Joi.object({
		channel: Joi.alternatives(
			Joi.string(),
			Joi.array().items(Joi.string())
		).required(),
		appKey: Joi.string().required(),
		data: Joi.any().required(),
		event: Joi.string().required(),
	});

	const { error } = schema.validate({ channel, appKey, data, event });

	if (error) {
		return res
			.status(400)
			.json(`Validation error: ${error.details[0].message}`);
	}

	const sendMessages = (channel: string, data: any, event: string) => {
		if (!appKey || !event || !channel) {
			console.error(
				"Invalid parameters: appKey, event, or channel is missing!"
			);
			return;
		}

		if (!subscriptions[appKey]?.[event]?.[channel]) {
			console.error(
				`No subscriptions found for appKey: "${appKey}", event: "${event}", channel: "${channel}"`
			);
			return;
		}

		subscriptions[appKey][event][channel]?.forEach((ws) => {
			if (ws.readyState === WebSocket.OPEN) {
				const { socket, ...filteredData } = data;

				ws.send(
					JSON.stringify({
						event,
						channel,
						data: filteredData,
						socket,
					})
				);
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

app.use(requestIp.mw());
app.use(bodyParser.json());
app.use("/", router);

app.listen(PORT, () => {
	console.log(`HTTP server is running on ${PROTOCOL}://${HOST}:${PORT}`);
});

console.log(
	`WebSocket server is running on ${
		PROTOCOL === "http" ? "ws" : "wss"
	}://${HOST}:${WSPORT}`
);
