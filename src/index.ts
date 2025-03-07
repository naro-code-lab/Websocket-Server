import express from "express";
import requestIp from "request-ip";
import bodyParser from "body-parser";
import { WebSocket, WebSocketServer } from "ws";
import { SubscriptionInterface } from "./types";
import "dotenv/config";

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
const wss = new WebSocketServer({ port: parseInt(WSPORT, 10) });

let subscriptions: SubscriptionInterface = {};

// Handle WebSocket connections
wss.on("connection", (ws: WebSocket, req) => {
	let channel = "";

	ws.on("message", (message: string) => {
		try {
			const data = JSON.parse(message);

			if (!data.channel) {
				return;
			}

			channel = data.channel;

			if (!subscriptions[channel]) {
				subscriptions[channel] = [ws];
			} else {
				subscriptions[channel].push(ws);
			}
		} catch (error) {
			console.error("Invalid WebSocket message:", message);
		}
	});

	ws.on("close", () => {
		if (channel && subscriptions[channel]) {
			subscriptions[channel] = subscriptions[channel].filter(
				(client) => client !== ws
			);

			if (!subscriptions[channel].length) {
				delete subscriptions[channel];
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
	const { channel, data, event } = req.body;

	const sendMessages = (channel: string, data: any, event: string) => {
		subscriptions[channel]?.forEach((ws) => {
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
