import express from "express";
import requestIp from "request-ip";
import bodyParser from "body-parser";
import { WebSocket } from "ws";
import { SubscriptionInterface } from "./types";
import "dotenv/config";

if (!process.env.HOST) {
	throw Error("Host is not set or found in .env");
}

if (!process.env.PORT) {
	throw Error("Port is not set or found in .env");
}

if (!process.env.WSPORT) {
	throw Error("Websocket port is not set or found in .env");
}

if (!process.env.ALLOWED_BROADCASTING_SERVER_IPS) {
	throw Error("Broadcasting server IP is not set or found in .env");
}

const app = express();
const router = express.Router();
const wss = new WebSocket.Server({ port: parseInt(process.env.WSPORT) });

let subscriptions: SubscriptionInterface = {};

wss.on("connection", (ws: WebSocket, req) => {
	let channel: string = "";

	ws.on("message", (message: any) => {
		const data = JSON.parse(
			Buffer.from(message as unknown as string).toString()
		);

		channel = data.channel;

		if (!subscriptions[data.channel]) {
			subscriptions[data.channel] = new Array(1).fill(ws);
		} else {
			subscriptions[data?.channel].push(ws);
		}
	});

	ws.on("close", () => {
		if (channel) {
			subscriptions[channel] = subscriptions[channel].filter(
				(client) => client !== ws
			);

			if (!subscriptions[channel].length) {
				delete subscriptions[channel];
			}
		}
	});
});

router.use((req, res, next) => {
	const clientIp = requestIp.getClientIp(req);

	let blacklisedIps =
		process.env.BLACKLISTED_BROADCASTING_SERVER_IPS?.split(",");

	if (blacklisedIps?.includes(clientIp as string)) {
		return res.status(401).send("Connection is blacklisted!");
	}

	let allowedIps = process.env.ALLOWED_BROADCASTING_SERVER_IPS?.split(",");

	if (
		process.env.ALLOWED_BROADCASTING_SERVER_IPS === "*" ||
		allowedIps?.includes(clientIp as string)
	) {
		return next();
	}

	return res.status(401).send("Connection not whitelisted!");
});

router.post("/", (req, res) => {
	const { channel, data, event } = req.body;

	subscriptions[channel?.name]?.forEach((ws) => {
		if (ws.readyState === WebSocket.OPEN) {
			let socket = data["socket"];

			delete data["socket"];

			ws.send(
				JSON.stringify({
					event: event,
					channel: channel,
					data,
					socket,
				})
			);
		}
	});

	return res.sendStatus(200);
});

app.use(requestIp.mw());
app.use(bodyParser.json());

app.post("/", router);

app.listen(process.env.PORT, () => {
	console.log(
		`HTTP server is running on ${process.env.PROTOCOL}://${process.env.HOST}:${process.env.PORT}`
	);
});

console.log(
	`WebSocket server is running on ${
		process.env.PROTOCOL === "http" ? "ws" : "wss"
	}://${process.env.HOST}:${process.env.WSPORT}`
);
