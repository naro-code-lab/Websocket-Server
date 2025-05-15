import express from "express";
import requestIp from "request-ip";
import bodyParser from "body-parser";
import { WebSocket, WebSocketServer, RawData } from "ws";
import { SubscriptionInterface } from "./types";
import "dotenv/config";
import Joi from "joi";

const {
	HOST,
	PORT,
	WSPORT,
	ALLOWED_BROADCASTING_SERVER_IPS,
	PROTOCOL = "http",
	BLACKLISTED_BROADCASTING_SERVER_IPS = "",
} = process.env;

if (!HOST || !PORT || !WSPORT || !ALLOWED_BROADCASTING_SERVER_IPS) {
	throw new Error("Missing required environment variables.");
}

const app = express();
const router = express.Router();
const wss = new WebSocketServer({ port: Number(WSPORT) });

let subscriptions: SubscriptionInterface = {};

// Helper: safely add a ws client subscription
const addSubscription = (
	appKey: string,
	event: string,
	channel: string,
	ws: WebSocket
) => {
	if (!subscriptions[appKey]) subscriptions[appKey] = {};
	if (!subscriptions[appKey][event]) subscriptions[appKey][event] = {};
	if (!subscriptions[appKey][event][channel])
		subscriptions[appKey][event][channel] = [];

	if (!subscriptions[appKey][event][channel].includes(ws)) {
		subscriptions[appKey][event][channel].push(ws);
	}
};

// Helper: safely remove a ws client subscription
const removeSubscription = (
	appKey: string,
	event: string,
	channel: string,
	ws: WebSocket
) => {
	const channelSubs = subscriptions[appKey]?.[event]?.[channel];
	if (!channelSubs) return;

	subscriptions[appKey][event][channel] = channelSubs.filter(
		(client) => client !== ws
	);

	// Clean up empty structures
	if (subscriptions[appKey][event][channel].length === 0)
		delete subscriptions[appKey][event][channel];
	if (Object.keys(subscriptions[appKey][event]).length === 0)
		delete subscriptions[appKey][event];
	if (Object.keys(subscriptions[appKey]).length === 0)
		delete subscriptions[appKey];
};

wss.on("connection", (ws: WebSocket, req) => {
	let appKey = "";
	let event = "";
	let channel = "";

	ws.on("message", (message: RawData) => {
		try {
			const parsedMessage = JSON.parse(message.toString());
			let { appKey: aKey, channel: ch, event: ev } = parsedMessage;

			if (!aKey || !ch || !ev) {
				return console.error(
					"Missing required fields (appKey, channel, event)."
				);
			}

			ev = ev.replace(/(\\\\|\\|\/\/|\/)/g, ".");

			appKey = aKey;
			event = ev;
			channel = ch;

			addSubscription(appKey, event, channel, ws);
		} catch {
			console.error("Invalid WebSocket message:", message.toString());
		}
	});

	ws.on("close", () => {
		if (appKey && event && channel) {
			removeSubscription(appKey, event, channel, ws);
		}
	});
});

// Middleware: IP filtering
router.use((req, res, next) => {
	const clientIp = requestIp.getClientIp(req) || "";

	const blacklistedIps = BLACKLISTED_BROADCASTING_SERVER_IPS.split(",").map(
		(ip) => ip.trim()
	);
	if (blacklistedIps.includes(clientIp)) {
		return res.status(401).send("Connection is blacklisted!");
	}

	const allowedIps = ALLOWED_BROADCASTING_SERVER_IPS.split(",").map((ip) =>
		ip.trim()
	);
	if (
		ALLOWED_BROADCASTING_SERVER_IPS === "*" ||
		allowedIps.includes("*") ||
		allowedIps.includes(clientIp)
	) {
		return next();
	}

	return res.status(401).send("Connection not whitelisted!");
});

router.post("/", bodyParser.json(), (req, res) => {
	const schema = Joi.object({
		channel: Joi.alternatives(
			Joi.string(),
			Joi.array().items(Joi.string())
		).required(),
		appKey: Joi.string().required(),
		data: Joi.any().required(),
		event: Joi.string().required(),
	});

	const { error, value } = schema.validate(req.body);
	if (error)
		return res
			.status(400)
			.json(`Validation error: ${error.details[0].message}`);

	value["event"] = value["event"].replace(/(\\\\|\\|\/\/|\/)/g, ".");

	let { appKey, event, data, channel } = value;

	const sendMessage = (ch: string) => {
		const clients = subscriptions[appKey]?.[event]?.[ch];
		if (!clients?.length) {
			return console.error(
				`No subscriptions for appKey="${appKey}", event="${event}", channel="${ch}"`
			);
		}

		clients.forEach((ws) => {
			if (ws.readyState === WebSocket.OPEN) {
				// Clone data and remove socket field if present
				const { socket, ...filteredData } = data;
				ws.send(
					JSON.stringify({
						event,
						channel: ch,
						data: filteredData,
						socket,
					})
				);
			}
		});
	};

	if (Array.isArray(channel)) {
		channel.forEach(sendMessage);
	} else {
		sendMessage(channel);
	}

	res.sendStatus(200);
});

app.use(requestIp.mw());
app.use("/", router);

app.listen(Number(PORT), () => {
	console.log(`HTTP server running on ${PROTOCOL}://${HOST}:${PORT}`);
});

console.log(
	`WebSocket server running on ${
		PROTOCOL === "http" ? "ws" : "wss"
	}://${HOST}:${WSPORT}`
);
