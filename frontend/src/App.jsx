import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

// --- Configuration ---
const API_BASE_URL = 'http://localhost:5000/api';
const RECO_API_URL = `${API_BASE_URL}/recommendations`;
const AUTH_API_URL = `${API_BASE_URL}/auth`;
const INTERACTION_API_URL = `${API_BASE_URL}/interactions`;
const MOBILES_API_URL = `${API_BASE_URL}/mobiles`;

const LS_USER = 'reco_user';
const LS_TOKEN = 'reco_token';
const BRAND_LIST = ['Realme', 'Micromax', 'Samsung', 'Lava', 'Motorola', 'Asus', 'Huawei', 'Oppo', 'LG', 'ZTE', 'Xiaomi', 'Nokia', 'Honor', 'Celkon', 'Intex', 'Panasonic', 'Gionee', 'Zen', 'Tecno', 'Alcatel', 'HTC'].sort();

/**
 * Main Application Component
 */
export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [token, setToken] = useState(null);
  const [currentPage, setCurrentPage] = useState('home');

  // --- Load user from localStorage ---
  useEffect(() => {
    const storedUser = localStorage.getItem(LS_USER);
    const storedToken = localStorage.getItem(LS_TOKEN);
    if (storedUser && storedToken) {
      setCurrentUser(JSON.parse(storedUser));
      setToken(storedToken);
    }

    // Detect URL on first load
    const path = window.location.pathname.replace('/', '') || 'home';
    setCurrentPage(path);
  }, []);

  // --- Sync URL whenever page changes ---
  const handlePageChange = (page) => {
    setCurrentPage(page);
    window.history.pushState({}, '', `/${page}`);
  };

  // --- Handle Login ---
  const handleLogin = useCallback((user, token) => {
    localStorage.setItem(LS_USER, JSON.stringify(user));
    localStorage.setItem(LS_TOKEN, token);
    setCurrentUser(user);
    setToken(token);
    handlePageChange('home');
  }, []);

  // --- Handle Logout ---
  const handleLogout = useCallback(() => {
    localStorage.removeItem(LS_USER);
    localStorage.removeItem(LS_TOKEN);
    setCurrentUser(null);
    setToken(null);
    handlePageChange('home');
  }, []);

  const renderPage = () => {
    if (!currentUser) return <LoginPage onLogin={handleLogin} />;

    switch (currentPage) {
      case 'home': return <HomePage currentUser={currentUser} token={token} />;
      case 'search': return <SearchPage token={token} />;
      case 'about': return <AboutPage />;
      default: return <HomePage currentUser={currentUser} token={token} />;
    }
  };

  return (
    <>
      <Header
        isLoggedIn={!!currentUser}
        onLogout={handleLogout}
        currentPage={currentPage}
        onPageChange={handlePageChange}
        username={currentUser?.username}
      />
      <main>
        <div className="page-container">{renderPage()}</div>
      </main>
    </>
  );
}

// =========================================================
// --- HEADER COMPONENT ---
// =========================================================
function Header({ isLoggedIn, onLogout, currentPage, onPageChange, username }) {
  return (
    <header className="app-header">
      <h1>Mobile Recommendation Engine</h1>
      {isLoggedIn && (
        <nav className="nav-tabs-container">
          <div className="nav-tabs">
            <button
              className={`nav-tab ${currentPage === 'home' ? 'active' : ''}`}
              onClick={() => onPageChange('home')}
            >
              Home
            </button>
            <button
              className={`nav-tab ${currentPage === 'search' ? 'active' : ''}`}
              onClick={() => onPageChange('search')}
            >
              Search
            </button>
            <button
              className={`nav-tab ${currentPage === 'about' ? 'active' : ''}`}
              onClick={() => onPageChange('about')}
            >
              About
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#2c3e50' }}>
              Welcome, {username}!
            </span>
            <button onClick={onLogout} className="logout-button">
              Logout
            </button>
          </div>
        </nav>
      )}
    </header>
  );
}

// --- LOGIN/REGISTER PAGE ---
function LoginPage({ onLogin }) {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    const url = isLogin ? `${AUTH_API_URL}/login` : `${AUTH_API_URL}/register`;

    try {
      const response = await axios.post(url, { username, password });
      setIsLoading(false); 
      onLogin(response.data.user, response.data.token);
    } catch (err) {
      setError(err.response?.data?.message || 'An unknown error occurred.');
      setIsLoading(false);
    }
  };

  return (
    <div className="form-container">
      <div className="form-tabs">
        <button className={`form-tab ${isLogin ? 'active' : ''}`} onClick={() => setIsLogin(true)}>Login</button>
        <button className={`form-tab ${!isLogin ? 'active' : ''}`} onClick={() => setIsLogin(false)}>Register</button>
      </div>
      <h2 style={{ textAlign: 'center', marginTop: 0 }}>{isLogin ? 'Welcome Back' : 'Create Account'}</h2>
      {error && <p className="form-error">{error}</p>}
      <form onSubmit={handleSubmit}>
        <div className="form-group"><label htmlFor="username">Username</label><input type="text" id="username" className="form-input" value={username} onChange={(e) => setUsername(e.target.value)} required /></div>
        <div className="form-group"><label htmlFor="password">Password</label><input type="password" id="password" className="form-input" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
        <button type="submit" className="form-button" disabled={isLoading}>{isLoading ? 'Loading...' : (isLogin ? 'Login' : 'Register')}</button>
      </form>
      {isLogin && (<p className="form-note">For testing, you can log in as:<br />User: <strong>user_1</strong> / Pass: <strong>password123</strong></p>)}
    </div>
  );
}

// --- HOME PAGE (RECOMMENDATION LOGIC) ---
function HomePage({ currentUser, token }) {
  const [recommendations, setRecommendations] = useState([]);
  const [recoType, setRecoType] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const [recoParams, setRecoParams] = useState({ page: 1, limit: 10, brand: '' });

  const handleRecoShelfChange = (key, value) => {
    setRecoParams(prev => ({ 
      ...prev, 
      [key]: value,
      page: (key === 'page') ? value : 1
    }));
  };

  useEffect(() => {
    const fetchRecommendations = async () => {
      if (!currentUser || !token) return; 
      setIsLoading(true);
      setError(null);
      setRecommendations([]);

      try {
        const response = await axios.get(RECO_API_URL, {
          headers: { Authorization: `Bearer ${token}` },
          params: { limit: recoParams.limit, page: recoParams.page, brand: recoParams.brand }
        });
        setRecommendations(response.data.recommendations || []);
        setRecoType(response.data.type || 'unknown');
      } catch (err) {
        console.error('Failed to fetch recommendations:', err);
        setError('Failed to fetch recommendations. Is the backend server running?');
      }
      setIsLoading(false);
    };
    fetchRecommendations();
  }, [currentUser, token, recoParams]);

  const handleProductClick = (mobile) => {
    axios.post(INTERACTION_API_URL, { itemId: mobile.url, interactionType: 'view' }, { headers: { Authorization: `Bearer ${token}` } })
    .catch(err => console.error("Failed to log interaction:", err));
    alert(`You clicked ${mobile.Brand} ${mobile.Model}\n\nThis interaction has been logged. Try refreshing after 5 clicks!`);
  };

  const getUserMessage = (type) => {
    switch (type) {
      case 'hybrid_warm_start': return 'Welcome back! Based on your recent activity, here are your personalized hybrid recommendations.';
      case 'cold_start_cbf': return 'Welcome! Since you\'re new, here are some items similar to the last one you viewed.';
      case 'cold_start_popular':
      case 'error_fallback_popular': return 'Welcome! Since you\'re new, here are some of our most popular items to get you started.';
      default: return 'Welcome to the store!';
    }
  };
  
  const getShelfTitle = (type) => {
      switch (type) {
        case 'hybrid_warm_start': return 'Just For You (Hybrid Model)';
        case 'cold_start_cbf': return 'Items Similar to Last Click (CBF Model)';
        case 'cold_start_popular': return 'Trending Now (Popularity Model)';
        case 'error_fallback_popular': return 'Top Picks (Error Fallback)';
        default: return 'Recommendations';
      }
    };


  return (
    <>
      <div className="welcome-box">
        <h2>Welcome, {currentUser.username}!</h2>
        <div className="welcome-message">
          <p>{isLoading ? "Loading your info..." : getUserMessage(recoType)}</p>
        </div>
      </div>
      
      <RecommendationShelf
        recommendations={recommendations}
        isLoading={isLoading}
        error={error}
        onProductClick={handleProductClick}
        title={getShelfTitle(recoType)}
        // Pass necessary props for controls to render within the shelf
        RecoShelfControls={RecoShelfControls}
        recoParams={recoParams}
        onBrandChange={(b) => handleRecoShelfChange('brand', b)}
        onPageChange={(p) => handleRecoShelfChange('page', p)}
        isPrevDisabled={recoParams.page === 1}
        isNextDisabled={recommendations.length < recoParams.limit || isLoading} 
      />
    </>
  );
}

// --- SEARCH PAGE ---
function SearchPage({ token }) {
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedMobile, setSelectedMobile] = useState(null);
  const [similarItems, setSimilarItems] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    const fetchSearch = async () => {
      try {
        const response = await axios.get(`${MOBILES_API_URL}/search`, {
          params: { q: query },
          headers: { 'Authorization': `Bearer ${token}` }
        });
        setSearchResults(response.data);
      } catch (err) {
        console.error("Search failed:", err);
      }
    };
    const delayDebounce = setTimeout(() => fetchSearch(), 300);
    return () => clearTimeout(delayDebounce);
  }, [query, token]);

  const handleSelectMobile = async (mobile) => {
    setQuery('');
    setSearchResults([]);
    setSelectedMobile(mobile);
    setIsLoading(true);
    setError(null);
    setSimilarItems([]);
    try {
      const response = await axios.get(`${MOBILES_API_URL}/similar`, {
        params: { itemId: mobile.url },
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setSimilarItems(response.data);
    } catch (err) {
      console.error("Failed to get similar items:", err);
      setError("Could not load similar items.");
    }
    setIsLoading(false);
  };

  return (
    <div>
      <h2>Find Similar Phones</h2>
      <p>Search for a phone to see content-based recommendations.</p>
      
      <div className="search-bar-container">
        <input type="text" className="search-bar" placeholder="Search for a phone (e.g., Realme, Micromax...)" value={query} onChange={(e) => setQuery(e.target.value)} />

        {searchResults.length > 0 && (
          <ul className="search-results-dropdown">
            {searchResults.map(mobile => (
              <li key={mobile.url} className="search-result-item" onClick={() => handleSelectMobile(mobile)}>{mobile.Brand} {mobile.Model}</li>
            ))}
          </ul>
        )}
      </div>

      {selectedMobile && (
        <div style={{ marginTop: '2rem' }}>
          <RecommendationShelf
            recommendations={similarItems}
            isLoading={isLoading}
            error={error}
            onProductClick={(m) => alert(`Clicked ${m.Brand} ${m.Model}`)}
            title={`Phones Similar to ${selectedMobile.Brand} ${selectedMobile.Model}`}
          />
        </div>
      )}
    </div>
  );
}

// --- ABOUT PAGE ---
function AboutPage() {
  return (
    <div className="about-container">
      <h2 className="about-title">About This Recommendation System</h2>

      <p className="about-desc">
        This application demonstrates a <strong>production-ready Hybrid Recommender System</strong> built
        using a <strong>microservice architecture</strong>. It combines multiple recommendation strategies
        for accurate, personalized results.
      </p>

      <div className="about-section">
        <h3 className="about-subtitle">⚙️ Technology Stack & Models Used</h3>
        <ul className="about-list">
          <li>🖥️ <strong>Frontend:</strong> React (JavaScript) for user interface.</li>
          <li>🧩 <strong>Backend Orchestration:</strong> Node.js (Express) with MongoDB.</li>
          <li>⚡ <strong>Model Serving:</strong> Python (FastAPI) for low-latency inference.</li>
          <li>🤝 <strong>Collaborative Filtering (CF):</strong> Truncated SVD Matrix Factorization.</li>
          <li>📊 <strong>Content-Based Filtering (CBF):</strong> TF-IDF Vectorization & Cosine Similarity.</li>
          <li>💾 <strong>Data Persistence:</strong> Browser <code>localStorage</code> for user session management.</li>
        </ul>
      </div>

      <p className="about-footer">
        Designed to provide a seamless and intelligent recommendation experience using modern AI and web technologies.
      </p>
    </div>
  );
}

// --- CONTROLS COMPONENT (RecoShelfControls) ---
function RecoShelfControls({ recoParams, onBrandChange, onPageChange, isPrevDisabled, isNextDisabled }) {
  return (
    <div className="controls-box" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', padding: '10px 0', borderBottom: '1px solid #eee'}}>
      <div className="filter-group" style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
        <label htmlFor="brand-filter" style={{fontWeight: 500}}>Filter by Brand:</label>
        <select
          id="brand-filter"
          className="form-input"
          style={{width: '150px', padding: '5px'}}
          value={recoParams.brand}
          onChange={(e) => onBrandChange(e.target.value)}
        >
          <option value="">All Brands</option>
          {BRAND_LIST.map(brand => (
            <option key={brand} value={brand}>{brand}</option>
          ))}
        </select>
      </div>

      <div className="pagination-group" style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
        <button 
          className="form-button" 
          style={{width: 'auto', padding: '8px 12px'}}
          onClick={() => onPageChange(recoParams.page - 1)} 
          disabled={isPrevDisabled}
        >
          Previous
        </button>
        <span className="page-info" style={{fontWeight: 600}}>Page {recoParams.page}</span>
        <button 
          className="form-button" 
          style={{width: 'auto', padding: '8px 12px'}}
          onClick={() => onPageChange(recoParams.page + 1)} 
          disabled={isNextDisabled}
        >
          Next
        </button>
      </div>
    </div>
  );
}

// --- REUSABLE SHELF COMPONENT ---
function RecommendationShelf({ title, recommendations, isLoading, error, onProductClick, RecoShelfControls, recoParams, onBrandChange, onPageChange, isPrevDisabled, isNextDisabled }) {
  
  // Conditionally render controls only if they are relevant (Home Page)
  const displayControls = RecoShelfControls && onBrandChange && onPageChange;

  return (
    <div className="reco-shelf">
      <h2>{title}</h2>
      
      {displayControls && (
        <RecoShelfControls 
          recoParams={recoParams}
          onBrandChange={onBrandChange}
          onPageChange={onPageChange}
          isPrevDisabled={isPrevDisabled}
          isNextDisabled={isNextDisabled}
        />
      )}

      {isLoading && (<div className="loading-spinner"><div className="spinner"></div></div>)}
      {error && <div className="error-message"><p>{error}</p></div>}

      {!isLoading && !error && recommendations.length === 0 && (
        <div className="error-message" style={{ backgroundColor: '#f9f9f9', color: '#555' }}>
          <p>No recommendations found. Adjust filters or try again later.</p>
        </div>
      )}

      {!isLoading && !error && recommendations.length > 0 && (
        <div className="reco-grid">
          {recommendations.map((mobile) => (
            <ProductCard key={mobile.url} mobile={mobile} onClick={() => onProductClick(mobile)} />
          ))}
        </div>
      )}
    </div>
  );
}

// --- PRODUCT CARD COMPONENT ---
function ProductCard({ mobile }) {
  const { Brand, Model, "Picture URL": imageUrl, "Operating system": os, url } = mobile;

  const handleError = (e) => {
    e.target.src = `https://placehold.co/180x180/e0e0e0/777?text=${Brand}`;
  };

  // 🔹 Log interaction before redirecting to NDTV
  const handleClick = async (e) => {
    e.preventDefault();
    const payload = {
      item_id: url,
      event: "click",
      brand: Brand,
      model: Model,
      timestamp: new Date().toISOString(),
    };

    try {
      await axios.post("http://localhost:8000/api/interactions", payload, {
        headers: { "Content-Type": "application/json" },
      });
      console.log("✅ Interaction logged:", payload);
    } catch (error) {
      console.warn("⚠️ Interaction logging failed, retrying...");
      // Retry once silently
      setTimeout(async () => {
        try {
          await axios.post("http://localhost:8000/api/interactions", payload);
        } catch {}
      }, 300);
    } finally {
      // Always open NDTV after sending interaction
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="product-card"
      title={`View ${Brand} ${Model} on NDTV`}
      onClick={handleClick}
    >
      <div className="product-card-img-container">
        <img
          src={imageUrl}
          alt={`${Brand} ${Model}`}
          className="product-card-img"
          onError={handleError}
        />
      </div>
      <div className="product-card-info">
        <h3>{Brand} {Model}</h3>
        <p>{os || 'N/A'}</p>
        <p className="view-link">View on NDTV 🔗</p>
      </div>
    </a>
  );
}
