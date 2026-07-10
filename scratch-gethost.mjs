import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const u = await db.user.findFirst({ where: { isHost: true } });
console.log(JSON.stringify(u));
await db.$disconnect();
