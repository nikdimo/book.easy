import { encode } from "next-auth/jwt";

const secret = "BciW8OnoJ2ZmzH4wj0TuLZ7FdlkUyu9Krqd0fuODEwU=";

const token = await encode({
  secret,
  salt: "authjs.session-token",
  token: {
    id: "cmrd82g9x0002udmogvoc5yse",
    sub: "cmrd82g9x0002udmogvoc5yse",
    email: "elena@example.com",
    name: "Elena Kostadinova",
    role: "USER",
    isHost: true,
  },
  maxAge: 60 * 60 * 24,
});

console.log(token);
