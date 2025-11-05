# Electronics Recommendation System

This is a **full-stack web application** that provides personalized electronics recommendations using **machine learning models**. The system combines **Content-Based Filtering (CBF)** and **Collaborative Filtering (CF)** approaches to suggest products to users.

---

## ⚙️ Features

* **Content-Based Filtering (CBF)**: Recommends products based on item features and similarity.  
* **Collaborative Filtering (CF)**: Uses user-item interactions to suggest items that similar users liked.  
* **Full-stack interface**: React frontend with Express and Python/Flask backend.  
* **Model artifacts included**: `.pkl` and `.npy` files for easy deployment.

---

## 🚀 Installation

### 1. Clone the repository

```bash
git clone https://github.com/KavyaJain1206/electronics-recommendation-system.git
cd electronics-recommendation-system
```
### 2. Backend setup
```bash
Copy code
cd backend
# Create virtual environment
python -m venv venv

# Activate virtual environment
# Windows
venv\Scripts\activate
# Linux / macOS
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

```
### 3. Frontend setup
```bash
Copy code
cd ../frontend
npm install
npm run dev
```
### 4. Run the backend server
``` bash
cd backend
node server.js

cd backend
uvicorn app:app --reload --host 0.0.0.0 --port 8000

The frontend runs on http://localhost:5173 (default Vite port), and API calls are served by the backend.
```
