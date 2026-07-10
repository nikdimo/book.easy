import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const l = await db.listing.findFirst({ where: { images: { some: {} } }, select: { id: true, title: true } });
console.log(JSON.stringify(l));
await db.$disconnect();
