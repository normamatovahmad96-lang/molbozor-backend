Task:
Set up a production-ready Node.js + Express backend with MongoDB (Atlas) for Molbozor.

Requirements (IMPORTANT):
- NO demo data
- NO in-memory arrays
- Use ONLY MongoDB for storage
- Backend must work on Render
- Frontend expects HTTP 201 on successful POST
- API must be stable and simple

Environment:
- MongoDB connection string is provided via environment variable:
  MONGO_URI
- App runs on Render, PORT is from process.env.PORT

Backend behavior:
1) Connect to MongoDB using mongoose and MONGO_URI
2) If MongoDB connection fails → log error and stop server
3) Define a Mongoose model "Elon" with fields:
   - title (string, required)
   - price (number, required)
   - description (string, optional)
   - phone (string, optional)
   - timestamps enabled
4) API routes:
   - GET /health
     → returns "ok" with status 200
   - GET /api/elons
     → returns all elons sorted by newest first (createdAt desc)
   - POST /api/elons
     → creates a new elon in MongoDB
     → returns created object
     → MUST return status 201 on success
5) Enable CORS and JSON body parsing
6) Listen on 0.0.0.0

Provide the FULL server.js file only.
Do NOT add extra features.
Do NOT add authentication.
Do NOT add demo/mock data.
