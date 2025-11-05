from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import numpy as np
import pickle
import os
import uvicorn

# ============================================================
# --- Smart Path Configuration ---
# Detects whether running inside Docker or locally
# ============================================================
CURRENT_FILE_DIR = os.path.dirname(os.path.abspath(__file__))

# Try Docker-style path first
if os.path.exists("/app/Models"):
    MODELS_ROOT = "/app/Models"
else:
    MODELS_ROOT = os.path.abspath(os.path.join(CURRENT_FILE_DIR, "..", "Models"))

# Adjust for your folder structure (not cf-artifacts/cbf-artifacts)
CF_DIR = os.path.join(MODELS_ROOT, "cf-artifacts")
CBF_DIR = os.path.join(MODELS_ROOT, "cbf-artifacts")

PORT = 8000

app = FastAPI(title="Recommendation Inference Service")

# ============================================================
# --- CORS CONFIGURATION ---
# Easily extend allowed origins here if you change frontend ports
# ============================================================
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "http://localhost:5000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================
# --- Globals ---
# ============================================================
CF_USER_FACTORS = None
CF_ITEM_FACTORS = None
CF_MAPPERS = None
CBF_SIM_MATRIX = None
CBF_MAPPERS = None


# ============================================================
# --- Artifact Loader ---
# ============================================================
def load_all_artifacts():
    global CF_USER_FACTORS, CF_ITEM_FACTORS, CF_MAPPERS
    global CBF_SIM_MATRIX, CBF_MAPPERS

    print(f"🧠 Loading model artifacts from: {MODELS_ROOT}")

    # --- CF (Collaborative Filtering) ---
    try:
        with open(os.path.join(CF_DIR, "mappers.pkl"), "rb") as f:
            CF_MAPPERS = pickle.load(f)

        CF_USER_FACTORS = np.load(os.path.join(CF_DIR, "user_factors.npy"))
        CF_ITEM_FACTORS = np.load(os.path.join(CF_DIR, "item_factors.npy"))

        # Ensure reverse mapping exists
        CF_MAPPERS["user_id_to_index"] = {
            v: k for k, v in CF_MAPPERS["users"].items()
        }

        print(
            f"✅ CF Model Loaded: {CF_USER_FACTORS.shape[0]} users × {CF_ITEM_FACTORS.shape[1]} factors."
        )
    except Exception as e:
        print(f"⚠️ Could not load CF artifacts from {CF_DIR}: {e}")

    # --- CBF (Content-Based Filtering) ---
    try:
        with open(os.path.join(CBF_DIR, "cbf_mappers.pkl"), "rb") as f:
            CBF_MAPPERS = pickle.load(f)

        CBF_SIM_MATRIX = np.load(os.path.join(CBF_DIR, "cbf_similarity_matrix.npy"))
        print(f"✅ CBF Model Loaded: Matrix {CBF_SIM_MATRIX.shape}")
    except Exception as e:
        print(f"⚠️ Could not load CBF artifacts from {CBF_DIR}: {e}")


# Load models on startup
load_all_artifacts()
print("🚀 All artifacts loaded. API ready.")


# ============================================================
# --- CF Recommendation Endpoint ---
# ============================================================
@app.get("/api/recommend/cf/{user_id:path}")
async def get_cf_recommendations(user_id: str, k: int = 50):
    if CF_USER_FACTORS is None or CF_MAPPERS is None:
        raise HTTPException(status_code=500, detail="CF model not loaded.")

    user_index = CF_MAPPERS["user_id_to_index"].get(user_id)
    if user_index is None:
        raise HTTPException(status_code=404, detail=f"User {user_id} not found (cold start).")

    try:
        user_vector = CF_USER_FACTORS[int(user_index)]
        scores = user_vector.dot(CF_ITEM_FACTORS)
        top_k_indices = np.argsort(scores)[-k:][::-1]
        recommendations = [CF_MAPPERS["items"][i] for i in top_k_indices]
        return {"user_id": user_id, "recommendations": recommendations}
    except Exception as e:
        print(f"❌ CF inference error for {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Error during CF inference.")


# ============================================================
# --- CBF Recommendation Endpoint ---
# ============================================================
@app.get("/api/recommend/cbf/{item_id:path}")
async def get_cbf_recommendations(item_id: str, k: int = 5):
    if CBF_SIM_MATRIX is None or CBF_MAPPERS is None:
        raise HTTPException(status_code=500, detail="CBF model not loaded.")

    item_index = CBF_MAPPERS["item_id_to_index"].get(item_id)
    if item_index is None:
        raise HTTPException(status_code=404, detail=f"Item {item_id} not found.")

    try:
        scores = CBF_SIM_MATRIX[item_index]
        top_indices = np.argsort(scores)[::-1][1 : k + 1]
        recommendations = [CBF_MAPPERS["index_to_item_id"][i] for i in top_indices]
        return {"item_id": item_id, "recommendations": recommendations}
    except Exception as e:
        print(f"❌ CBF inference error for {item_id}: {e}")
        raise HTTPException(status_code=500, detail="Error during CBF inference.")


# ============================================================
# --- Run server ---
# ============================================================
if __name__ == "__main__":
    print(f"\n🔧 Starting Python Recommender on port {PORT}")
    uvicorn.run("app:app", host="0.0.0.0", port=PORT, reload=True)
