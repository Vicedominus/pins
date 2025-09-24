MVP para agregar pines a un mapa con atributos. Backend en **Django + DRF**, frontend en **React + Leaflet (Vite)**.

## 📦 Stack
- Python 3.12, Django 4.2/5.x, Django REST Framework
- React 18, Vite, Leaflet / react-leaflet

## 🚀 Requisitos
- Python 3.12
- Node 18+ (o 20+)

## 🛠️ Backend (Django)
```bash
python -m venv .venv
# Win: .venv\Scripts\activate
# Mac/Linux: source .venv/bin/activate

pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```
## 💻 Frontend (Vite + React + Leaflet)

cd frontend
npm i
npm run dev

## 🗂️ Estructura
.
├─ api/                  # settings/urls del proyecto Django
├─ pins/                 # app Django (models, views, serializers)
├─ frontend/             # app React + Vite + Leaflet
├─ manage.py
├─ requirements.txt
└─ README.md