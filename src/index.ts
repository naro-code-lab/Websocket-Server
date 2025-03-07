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

	ws.on("message", (message: RawData) => {
		try {
			// Convert message from Buffer if necessary
			const parsedMessage = JSON.parse(
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

			const { appKey, channel } = parsedMessage;

			// Initialize appKey if not set
			if (!subscriptions[appKey]) {
				subscriptions[appKey] = {};
			}

			// Initialize channel if not set
			if (!subscriptions[appKey][channel]) {
				subscriptions[appKey][channel] = [ws];
			} else {
				subscriptions[appKey][channel].push(ws);
			}

			// console.log(`Subscribed: AppKey=${appKey}, Channel=${channel}`);
		} catch (error) {
			console.error("Invalid WebSocket message:", message.toString());
		}
	});

	ws.on("close", () => {
		if (channel && appKey) {
			subscriptions[appKey][channel] = subscriptions[appKey][
				channel
			].filter((client) => client !== ws);

			if (!subscriptions[appKey][channel].length) {
				delete subscriptions[appKey][channel];
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
		if (!subscriptions[appKey]) {
			console.error(`App key "${appKey}" not found!`);
			return;
		}

		subscriptions[appKey][channel]?.forEach((ws) => {
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
