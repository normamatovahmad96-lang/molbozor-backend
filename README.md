# molbozor-backend

Molbozor ilovasi uchun backend (API server).

## Texnologiyalar
- Node.js
- Express
- MongoDB (Mongoose)
- Render (deployment)

## API Endpoints

### Health check
GET /health  
Response: ok

### Elons (E’lonlar)

GET /api/elons  
Barcha e’lonlarni olish

POST /api/elons  
Yangi e’lon qo‘shish

Body example:
{
  "title": "Sigir",
  "price": 12000000,
  "description": "Sog‘lom, 3 yosh",
  "phone": "+998901234567"
}

## Environment Variables
Render dashboard’da quyidagi o‘zgaruvchi bo‘lishi shart:

MONGO_URI = MongoDB Atlas connection string
