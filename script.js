// Tradier API Configuration
const TRADIER_API_KEY = 'SbankthvlFeRl2IMBNWUTO3JbKFM';
const TRADIER_BASE_URL = 'https://api.tradier.com/v1';

// CORS proxy for development (uncomment if needed)
// const TRADIER_BASE_URL = 'https://cors-anywhere.herokuapp.com/https://api.tradier.com/v1';

// Global variables
let currentTicker = '';
let optionChains = [];
let stockQuote = null;

// DOM Elements
const tickerInput = document.getElementById('tickerInput');
const searchBtn = document.getElementById('searchBtn');
const filtersSection = document.getElementById('filtersSection');
const resultsSection = document.getElementById('resultsSection');
const errorMessage = document.getElementById('errorMessage');
const loadingOverlay = document.getElementById('loadingOverlay');
const expirationFilter = document.getElementById('expirationFilter');
const optionTypeFilter = document.getElementById('optionTypeFilter');
const sortBy = document.getElementById('sortBy');
const marketOutlook = document.getElementById('marketOutlook');

// Event Listeners
document.addEventListener('DOMContentLoaded', function() {
    searchBtn.addEventListener('click', handleSearch);
    tickerInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            handleSearch();
        }
    });
    
    // Filter event listeners
    expirationFilter.addEventListener('change', filterAndDisplayOptions);
    optionTypeFilter.addEventListener('change', filterAndDisplayOptions);
    sortBy.addEventListener('change', filterAndDisplayOptions);
    marketOutlook.addEventListener('change', updateOptimalContracts);
    
    // Auto-uppercase ticker input
    tickerInput.addEventListener('input', function(e) {
        e.target.value = e.target.value.toUpperCase();
    });
});

// Main search function
async function handleSearch() {
    const ticker = tickerInput.value.trim();
    
    if (!ticker) {
        showError('Please enter a stock ticker symbol');
        return;
    }
    
    if (!/^[A-Z]{1,5}$/.test(ticker)) {
        showError('Please enter a valid stock ticker (1-5 letters)');
        return;
    }
    
    currentTicker = ticker;
    showLoading(true);
    hideError();
    
    try {
        // Fetch stock quote and option chains in parallel
        const [quote, chains] = await Promise.all([
            fetchStockQuote(ticker),
            fetchOptionChains(ticker)
        ]);
        
        stockQuote = quote;
        optionChains = chains;
        
        if (chains.length === 0) {
            showError(`No option chains found for ${ticker}. This stock may not have options available.`);
            return;
        }
        
        // Populate expiration filter
        populateExpirationFilter();
        
        // Display results
        displayStockInfo();
        displayOptimalContracts();
        filterAndDisplayOptions();
        
        // Show results sections
        filtersSection.style.display = 'block';
        resultsSection.style.display = 'block';
        filtersSection.classList.add('fade-in');
        resultsSection.classList.add('fade-in');
        
    } catch (error) {
        console.error('Search error:', error);
        showError(error.message || 'Failed to fetch option data. Please try again.');
    } finally {
        showLoading(false);
    }
}

// Fetch stock quote
async function fetchStockQuote(ticker) {
    const response = await fetch(`${TRADIER_BASE_URL}/markets/quotes?symbols=${ticker}`, {
        headers: {
            'Authorization': `Bearer ${TRADIER_API_KEY}`,
            'Accept': 'application/json'
        }
    });
    
    if (!response.ok) {
        if (response.status === 401) {
            throw new Error('API authentication failed. Please check the API key.');
        } else if (response.status === 429) {
            throw new Error('API rate limit exceeded. Please wait a moment and try again.');
        } else {
            throw new Error(`Failed to fetch stock quote: ${response.status} - ${response.statusText}`);
        }
    }
    
    const data = await response.json();
    console.log('Quote API response:', JSON.stringify(data, null, 2)); // Debug log
    
    if (!data.quotes || !data.quotes.quote) {
        throw new Error(`Stock quote not found for ${ticker}. Please verify the ticker symbol is correct.`);
    }
    
    return data.quotes.quote;
}

// Fetch available expiration dates from Tradier
async function fetchExpirationDates(ticker) {
    try {
        const response = await fetch(`${TRADIER_BASE_URL}/markets/options/expirations?symbol=${ticker}`, {
            headers: {
                'Authorization': `Bearer ${TRADIER_API_KEY}`,
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            console.warn(`Failed to fetch expirations for ${ticker}: ${response.status}`);
            return [];
        }
        
        const data = await response.json();
        console.log('Tradier expiration dates response:', JSON.stringify(data, null, 2));
        
        let expirations = [];
        if (data.expirations && data.expirations.date) {
            if (Array.isArray(data.expirations.date)) {
                expirations = data.expirations.date;
            } else {
                expirations = [data.expirations.date];
            }
        }
        
        console.log(`Available expiration dates for ${ticker}:`, expirations);
        return expirations.slice(0, 5); // Limit to first 5 expirations
        
    } catch (error) {
        console.error('Error fetching expiration dates:', error);
        return [];
    }
}

// Fetch option chains using Tradier's actual expiration dates
async function fetchOptionChains(ticker) {
    try {
        // First, get the actual expiration dates from Tradier
        let expirations = await fetchExpirationDates(ticker);
        
        if (expirations.length === 0) {
            // Fallback: Generate common expiration patterns
            console.log('No expirations from API, generating common Friday dates...');
            const today = new Date();
            expirations = [];
            
            // Generate next few Fridays (common option expiration dates)
            for (let i = 0; i < 8; i++) {
                const futureDate = new Date(today);
                futureDate.setDate(today.getDate() + (i * 7));
                
                // Find next Friday
                const dayOfWeek = futureDate.getDay();
                const daysToFriday = (5 - dayOfWeek + 7) % 7;
                if (daysToFriday === 0 && i === 0) {
                    // If today is Friday, get next Friday
                    futureDate.setDate(futureDate.getDate() + 7);
                } else {
                    futureDate.setDate(futureDate.getDate() + daysToFriday);
                }
                
                // Format as YYYY-MM-DD
                const expiration = futureDate.toISOString().split('T')[0];
                expirations.push(expiration);
            }
            
            console.log('Generated expiration dates to try:', expirations);
        }
        
        // Try to fetch option chains for each expiration
        const chainPromises = expirations.map(expiration => 
            fetchOptionChainForExpiration(ticker, expiration)
        );
        
        const chainResults = await Promise.all(chainPromises);
        const validChains = chainResults.flat().filter(option => option !== null);
        
        if (validChains.length === 0) {
            // Final fallback: try the symbols lookup approach
            console.log('No chains found with expiration dates, trying symbols lookup...');
            return await fetchOptionChainsFromSymbols(ticker);
        }
        
        return validChains;
        
    } catch (error) {
        console.error('Error fetching option chains:', error);
        throw error;
    }
}

// Fallback method using symbols lookup
async function fetchOptionChainsFromSymbols(ticker) {
    try {
        const symbolsResponse = await fetch(`${TRADIER_BASE_URL}/markets/options/lookup?underlying=${ticker}`, {
            headers: {
                'Authorization': `Bearer ${TRADIER_API_KEY}`,
                'Accept': 'application/json'
            }
        });
        
        if (!symbolsResponse.ok) {
            console.warn(`Symbols lookup failed: ${symbolsResponse.status}`);
            return [];
        }
        
        const symbolsData = await symbolsResponse.json();
        console.log('Symbols API response:', JSON.stringify(symbolsData, null, 2));
        
        // Handle different response formats
        let symbols = [];
        if (symbolsData.symbols) {
            if (Array.isArray(symbolsData.symbols)) {
                symbols = symbolsData.symbols;
            } else if (symbolsData.symbols.symbol) {
                symbols = Array.isArray(symbolsData.symbols.symbol) ? symbolsData.symbols.symbol : [symbolsData.symbols.symbol];
            }
        }
        
        if (symbols.length === 0) {
            console.warn('No symbols found for', ticker);
            return [];
        }
        
        // Extract expiration dates from symbols
        const expirations = [...new Set(symbols.map(symbol => {
            if (typeof symbol === 'string') {
                // Parse symbol string
                const match = symbol.match(/(\d{6})/); // Find 6-digit date
                if (match) {
                    const dateStr = match[1];
                    const year = '20' + dateStr.substring(0, 2);
                    const month = dateStr.substring(2, 4);
                    const day = dateStr.substring(4, 6);
                    return `${year}-${month}-${day}`;
                }
            } else if (typeof symbol === 'object' && symbol) {
                return symbol.expiration_date || symbol.expiration;
            }
            return null;
        }).filter(exp => exp !== null))].slice(0, 5);
        
        if (expirations.length === 0) {
            return [];
        }
        
        // Fetch chains for found expirations
        const chainPromises = expirations.map(expiration => 
            fetchOptionChainForExpiration(ticker, expiration)
        );
        
        const chainResults = await Promise.all(chainPromises);
        return chainResults.flat().filter(option => option !== null);
        
    } catch (error) {
        console.error('Error in symbols fallback:', error);
        return [];
    }
}

// Fetch option chain for specific expiration
async function fetchOptionChainForExpiration(ticker, expiration) {
    try {
        const response = await fetch(`${TRADIER_BASE_URL}/markets/options/chains?symbol=${ticker}&expiration=${expiration}&greeks=true`, {
            headers: {
                'Authorization': `Bearer ${TRADIER_API_KEY}`,
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            console.warn(`Failed to fetch chain for ${expiration}: ${response.status}`);
            return [];
        }
        
        const data = await response.json();
        console.log(`Option chain response for ${expiration}:`, JSON.stringify(data, null, 2)); // Debug log
        
        if (!data.options || !data.options.option) {
            console.warn(`No options found for ${ticker} expiring ${expiration}`);
            return [];
        }
        
        // Ensure we have an array
        const options = Array.isArray(data.options.option) ? data.options.option : [data.options.option];
        
        const currentPrice = stockQuote?.last || 0;
        
        return options.map(option => {
            const enhancedOption = {
                ...option,
                expiration_date: expiration,
                days_to_expiry: calculateDaysToExpiry(expiration),
                moneyness: calculateMoneyness(option.strike, currentPrice, option.option_type),
                // Calculate derived metrics for analysis
                intrinsic_value: calculateIntrinsicValue(option.strike, currentPrice, option.option_type),
                time_value: calculateTimeValue(option.last, option.strike, currentPrice, option.option_type),
                break_even: calculateBreakEven(option.strike, option.last, option.option_type)
            };
            
            // Use Tradier's Greeks data if available, otherwise calculate our own
            if (option.greeks) {
                // Tradier provides the Greeks data - use it directly
                console.log('Using Tradier Greeks for', option.symbol, ':', option.greeks);
                enhancedOption.greeks = {
                    delta: option.greeks.delta || 0,
                    gamma: option.greeks.gamma || 0,
                    theta: option.greeks.theta || 0,
                    vega: option.greeks.vega || 0,
                    rho: option.greeks.rho || 0,
                    phi: option.greeks.phi || 0,
                    impliedVol: option.greeks.smv_vol || option.greeks.mid_iv || 0,
                    bid_iv: option.greeks.bid_iv || 0,
                    ask_iv: option.greeks.ask_iv || 0,
                    updated_at: option.greeks.updated_at
                };
            } else if (currentPrice > 0 && option.strike && enhancedOption.days_to_expiry > 0) {
                // Fallback to calculated Greeks if Tradier doesn't provide them
                enhancedOption.greeks = calculateGreeks(enhancedOption, currentPrice);
            } else {
                enhancedOption.greeks = {
                    delta: 0,
                    gamma: 0,
                    theta: 0,
                    vega: 0,
                    impliedVol: 0
                };
            }
            
            return enhancedOption;
        });
        
    } catch (error) {
        console.warn(`Error fetching chain for ${expiration}:`, error);
        return [];
    }
}

// Calculate days to expiry
function calculateDaysToExpiry(expirationDate) {
    const expiry = new Date(expirationDate);
    const today = new Date();
    const diffTime = expiry - today;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

// Calculate moneyness
function calculateMoneyness(strike, currentPrice, optionType) {
    if (!currentPrice || currentPrice === 0) return 0;
    
    if (optionType === 'call') {
        return (currentPrice - strike) / currentPrice;
    } else {
        return (strike - currentPrice) / currentPrice;
    }
}

// Calculate intrinsic value
function calculateIntrinsicValue(strike, currentPrice, optionType) {
    if (!currentPrice || currentPrice === 0) return 0;
    
    if (optionType === 'call') {
        return Math.max(0, currentPrice - strike);
    } else {
        return Math.max(0, strike - currentPrice);
    }
}

// Calculate time value
function calculateTimeValue(optionPrice, strike, currentPrice, optionType) {
    if (!optionPrice || !currentPrice) return 0;
    
    const intrinsicValue = calculateIntrinsicValue(strike, currentPrice, optionType);
    return Math.max(0, optionPrice - intrinsicValue);
}

// Calculate break-even price
function calculateBreakEven(strike, optionPrice, optionType) {
    if (!optionPrice) return 0;
    
    if (optionType === 'call') {
        return strike + optionPrice;
    } else {
        return strike - optionPrice;
    }
}

// Black-Scholes functions for Greeks calculation
function normalCDF(x) {
    // Approximation of the cumulative distribution function for standard normal distribution
    const a1 =  0.254829592;
    const a2 = -0.284496736;
    const a3 =  1.421413741;
    const a4 = -1.453152027;
    const a5 =  1.061405429;
    const p  =  0.3275911;

    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x) / Math.sqrt(2.0);

    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

    return 0.5 * (1.0 + sign * y);
}

function normalPDF(x) {
    return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

function calculateD1(S, K, r, T, sigma) {
    return (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
}

function calculateD2(d1, sigma, T) {
    return d1 - sigma * Math.sqrt(T);
}

// Calculate Greeks using Black-Scholes model
function calculateGreeks(option, currentPrice, riskFreeRate = 0.05) {
    const S = currentPrice; // Current stock price
    const K = option.strike; // Strike price
    const T = option.days_to_expiry / 365; // Time to expiry in years
    const r = riskFreeRate; // Risk-free rate (5% default)
    
    // Estimate implied volatility from option price (simplified approach)
    const optionPrice = option.last || ((option.bid || 0) + (option.ask || 0)) / 2;
    if (!optionPrice || optionPrice <= 0 || T <= 0 || S <= 0) {
        return {
            delta: 0,
            gamma: 0,
            theta: 0,
            vega: 0,
            impliedVol: 0
        };
    }
    
    // Simple implied volatility estimation (this is approximate)
    let sigma = 0.2; // Start with 20% volatility
    
    // Try to estimate better IV based on option price relative to intrinsic value
    const intrinsicValue = calculateIntrinsicValue(K, S, option.option_type);
    const timeValue = Math.max(0, optionPrice - intrinsicValue);
    
    if (timeValue > 0 && T > 0) {
        // Rough IV estimation based on time value
        sigma = Math.min(2.0, Math.max(0.1, timeValue / (S * Math.sqrt(T)) * 2));
    }
    
    const d1 = calculateD1(S, K, r, T, sigma);
    const d2 = calculateD2(d1, sigma, T);
    
    const Nd1 = normalCDF(d1);
    const Nd2 = normalCDF(d2);
    const nd1 = normalPDF(d1);
    
    let delta, gamma, theta, vega;
    
    if (option.option_type === 'call') {
        delta = Nd1;
        theta = -(S * nd1 * sigma) / (2 * Math.sqrt(T)) - r * K * Math.exp(-r * T) * Nd2;
    } else {
        delta = Nd1 - 1;
        theta = -(S * nd1 * sigma) / (2 * Math.sqrt(T)) + r * K * Math.exp(-r * T) * (1 - Nd2);
    }
    
    gamma = nd1 / (S * sigma * Math.sqrt(T));
    vega = S * nd1 * Math.sqrt(T) / 100; // Divided by 100 for percentage points
    theta = theta / 365; // Convert to daily theta
    
    return {
        delta: isFinite(delta) ? delta : 0,
        gamma: isFinite(gamma) ? gamma : 0,
        theta: isFinite(theta) ? theta : 0,
        vega: isFinite(vega) ? vega : 0,
        impliedVol: sigma
    };
}

// Calculate Greeks-based score for option ranking
function calculateGreeksScore(option, currentPrice, marketOutlook = 'neutral') {
    let score = 0;
    const weights = {
        delta: 0.3,
        gamma: 0.2,
        theta: 0.25,
        vega: 0.15,
        volume: 0.1
    };
    
    // Delta score (prefer higher absolute delta for directional plays)
    if (option.greeks?.delta) {
        const deltaAbs = Math.abs(option.greeks.delta);
        if (marketOutlook === 'bullish' && option.option_type === 'call') {
            score += deltaAbs * weights.delta * 100;
        } else if (marketOutlook === 'bearish' && option.option_type === 'put') {
            score += deltaAbs * weights.delta * 100;
        } else {
            score += deltaAbs * weights.delta * 50; // Neutral outlook
        }
    }
    
    // Gamma score (higher gamma = more price sensitivity)
    if (option.greeks?.gamma) {
        score += Math.min(option.greeks.gamma * 1000, 50) * weights.gamma;
    }
    
    // Theta score (penalize high time decay)
    if (option.greeks?.theta) {
        const thetaPenalty = Math.abs(option.greeks.theta) * 100;
        score -= Math.min(thetaPenalty, 30) * weights.theta;
    }
    
    // Vega score (moderate vega preferred)
    if (option.greeks?.vega) {
        const vegaScore = Math.min(option.greeks.vega * 10, 20);
        score += vegaScore * weights.vega;
    }
    
    // Volume/liquidity score
    const volumeScore = Math.min((option.volume || 0) / 100, 10);
    score += volumeScore * weights.volume;
    
    // Moneyness bonus (slight preference for near-the-money)
    const moneynessBonus = Math.max(0, 10 - Math.abs(option.moneyness * 100));
    score += moneynessBonus * 0.1;
    
    return Math.max(0, score);
}

// Populate expiration filter
function populateExpirationFilter() {
    const expirations = [...new Set(optionChains.map(option => option.expiration_date))].sort();
    
    console.log('Expiration dates found in option chains:', expirations);
    
    const dateAnalysis = expirations.map(exp => {
        const date = new Date(exp);
        const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'long' });
        const isTypicalFriday = dayOfWeek === 'Friday';
        const isThursday = dayOfWeek === 'Thursday';
        
        return {
            raw: exp,
            formatted: formatDate(exp),
            dayOfWeek: dayOfWeek,
            isStandard: isTypicalFriday,
            isHolidayAdjusted: isThursday,
            note: isThursday ? 'Likely holiday-adjusted' : isTypicalFriday ? 'Standard Friday' : 'Non-standard expiration'
        };
    });
    
    console.log('Expiration date analysis:', dateAnalysis);
    
    const nonStandardCount = dateAnalysis.filter(d => !d.isStandard).length;
    if (nonStandardCount > 0) {
        console.warn(`⚠️ Found ${nonStandardCount} non-standard expiration dates (not Fridays). This is normal for holiday adjustments or special expirations.`);
    }
    
    expirationFilter.innerHTML = '<option value="">All Expirations</option>';
    
    expirations.forEach(expiration => {
        const option = document.createElement('option');
        option.value = expiration;
        
        const date = new Date(expiration);
        const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'short' });
        const isThursday = dayOfWeek === 'Thu';
        const isFriday = dayOfWeek === 'Fri';
        
        let displayText = formatDate(expiration);
        if (isThursday) {
            displayText += ' (Thu - Holiday Adj.)';
        } else if (!isFriday) {
            displayText += ` (${dayOfWeek})`;
        }
        
        option.textContent = displayText;
        expirationFilter.appendChild(option);
    });
}

// Display stock information
function displayStockInfo() {
    const stockInfo = document.getElementById('stockInfo');
    
    if (!stockQuote) {
        stockInfo.innerHTML = '<p>Stock information unavailable</p>';
        return;
    }
    
    const changePercent = ((stockQuote.last - stockQuote.prevclose) / stockQuote.prevclose * 100).toFixed(2);
    const changeClass = changePercent >= 0 ? 'positive' : 'negative';
    
    stockInfo.innerHTML = `
        <h2>${stockQuote.symbol} - ${stockQuote.description || 'N/A'}</h2>
        <div class="stock-details">
            <div class="stock-detail">
                <div class="label">Current Price</div>
                <div class="value">$${stockQuote.last?.toFixed(2) || 'N/A'}</div>
            </div>
            <div class="stock-detail">
                <div class="label">Change</div>
                <div class="value ${changeClass}">
                    ${changePercent >= 0 ? '+' : ''}${changePercent}%
                </div>
            </div>
            <div class="stock-detail">
                <div class="label">Volume</div>
                <div class="value">${formatNumber(stockQuote.volume) || 'N/A'}</div>
            </div>
            <div class="stock-detail">
                <div class="label">Bid/Ask</div>
                <div class="value">$${stockQuote.bid?.toFixed(2) || 'N/A'} / $${stockQuote.ask?.toFixed(2) || 'N/A'}</div>
            </div>
        </div>
    `;
    
    // Display volume leaders section
    displayVolumeLeaders();
    
    // Add expiration date notice if needed
    displayExpirationNotice();
}

// Display top volume options
function displayVolumeLeaders() {
    const container = document.getElementById('stockInfo');
    
    if (!optionChains.length) return;
    
    // Get top volume options
    const topVolumeOptions = optionChains
        .filter(o => o.volume > 0)
        .sort((a, b) => b.volume - a.volume)
        .slice(0, 5);
    
    if (topVolumeOptions.length === 0) return;
    
    const volumeLeadersHtml = `
        <div class="volume-leaders-section">
            <h3><i class="fas fa-fire"></i> Volume Leaders</h3>
            <div class="volume-leaders-grid">
                ${topVolumeOptions.map(option => `
                    <div class="volume-leader-card">
                        <div class="volume-leader-header">
                            <span class="option-type ${option.option_type}">${option.option_type.toUpperCase()}</span>
                            <span class="volume-badge">${formatNumber(option.volume)}</span>
                        </div>
                        <div class="volume-leader-details">
                            <div class="strike-price">$${option.strike} Strike</div>
                            <div class="expiry-date">${formatDate(option.expiration_date)} (${new Date(option.expiration_date).toLocaleDateString('en-US', { weekday: 'short' })})</div>
                            <div class="price-info">$${option.last?.toFixed(2) || option.bid?.toFixed(2) || 'N/A'}</div>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
    
    container.insertAdjacentHTML('beforeend', volumeLeadersHtml);
}

// Display expiration date notice for non-standard dates
function displayExpirationNotice() {
    if (!optionChains.length) return;
    
    const container = document.getElementById('stockInfo');
    const expirations = [...new Set(optionChains.map(option => option.expiration_date))];
    
    const nonStandardDates = expirations.filter(exp => {
        const dayOfWeek = new Date(exp).toLocaleDateString('en-US', { weekday: 'long' });
        return dayOfWeek !== 'Friday';
    });
    
    if (nonStandardDates.length > 0) {
        const thursdayCount = nonStandardDates.filter(exp => {
            const dayOfWeek = new Date(exp).toLocaleDateString('en-US', { weekday: 'long' });
            return dayOfWeek === 'Thursday';
        }).length;
        
        let noticeText = '';
        if (thursdayCount === nonStandardDates.length) {
            noticeText = 'Options expire on Thursdays due to market holiday adjustments.';
        } else if (thursdayCount > 0) {
            noticeText = `Some options expire on non-standard days (${thursdayCount} on Thursdays, likely due to holidays).`;
        } else {
            noticeText = 'Some options have non-standard expiration days (not Fridays).';
        }
        
        const noticeHtml = `
            <div class="expiration-notice">
                <div class="notice-header">
                    <i class="fas fa-calendar-alt"></i>
                    <span>Expiration Date Notice</span>
                </div>
                <div class="notice-text">${noticeText}</div>
            </div>
        `;
        
        container.insertAdjacentHTML('beforeend', noticeHtml);
    }
}

// Display optimal contracts
function displayOptimalContracts() {
    const container = document.getElementById('optimalContracts');
    
    // Find optimal contracts based on different criteria
    const optimalContracts = findOptimalContracts();
    
    if (optimalContracts.length === 0) {
        container.innerHTML = '<p>No optimal contracts identified</p>';
        return;
    }
    
    container.innerHTML = `
        <h3><i class="fas fa-star"></i> AI-Recommended Contracts (Volume + Greeks Analysis)</h3>
        <div class="optimal-grid">
            ${optimalContracts.map(contract => `
                <div class="optimal-card">
                    <h4>
                        <i class="fas fa-${contract.option_type === 'call' ? 'arrow-up' : 'arrow-down'}"></i>
                        ${contract.reason}
                        ${contract.greeks_score ? `<span class="score">(Score: ${contract.greeks_score.toFixed(1)})</span>` : ''}
                    </h4>
                    <div class="contract-details">
                        <div class="detail">
                            <span>Symbol:</span>
                            <span>${contract.symbol}</span>
                        </div>
                        <div class="detail">
                            <span>Strike:</span>
                            <span>$${contract.strike}</span>
                        </div>
                        <div class="detail">
                            <span>Expiry:</span>
                            <span>${formatDate(contract.expiration_date)}</span>
                        </div>
                        <div class="detail">
                            <span>Bid/Ask:</span>
                            <span>$${contract.bid?.toFixed(2) || 'N/A'} / $${contract.ask?.toFixed(2) || 'N/A'}</span>
                        </div>
                        <div class="detail">
                            <span>Break-Even:</span>
                            <span>$${contract.break_even?.toFixed(2) || 'N/A'}</span>
                        </div>
                        <div class="detail">
                            <span>Delta:</span>
                            <span>${contract.greeks?.delta?.toFixed(3) || 'N/A'}</span>
                        </div>
                        <div class="detail">
                            <span>Gamma:</span>
                            <span>${contract.greeks?.gamma?.toFixed(4) || 'N/A'}</span>
                        </div>
                        <div class="detail">
                            <span>Theta:</span>
                            <span>${contract.greeks?.theta?.toFixed(3) || 'N/A'}</span>
                        </div>
                        <div class="detail">
                            <span>Vega:</span>
                            <span>${contract.greeks?.vega?.toFixed(3) || 'N/A'}</span>
                        </div>
                        <div class="detail">
                            <span>Implied Vol:</span>
                            <span>${contract.greeks?.impliedVol ? (contract.greeks.impliedVol * 100).toFixed(1) + '%' : 'N/A'}</span>
                        </div>
                        <div class="detail">
                            <span>Volume:</span>
                            <span>${formatNumber(contract.volume) || 'N/A'}</span>
                        </div>
                        <div class="detail">
                            <span>Intrinsic Value:</span>
                            <span>$${contract.intrinsic_value?.toFixed(2) || 'N/A'}</span>
                        </div>
                        <div class="detail">
                            <span>Time Value:</span>
                            <span>$${contract.time_value?.toFixed(2) || 'N/A'}</span>
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

// Update optimal contracts when market outlook changes
function updateOptimalContracts() {
    if (optionChains.length > 0) {
        displayOptimalContracts();
    }
}

// Find optimal contracts using Greeks analysis
function findOptimalContracts() {
    if (!optionChains.length) return [];
    
    const currentPrice = stockQuote?.last || 0;
    const outlook = marketOutlook?.value || 'neutral';
    const optimal = [];
    
    // Calculate Greeks scores for all options
    const scoredOptions = optionChains.map(option => ({
        ...option,
        greeks_score: calculateGreeksScore(option, currentPrice, outlook)
    }));
    
    // Highest volume options overall
    const highestVolumeOptions = [...scoredOptions]
        .filter(o => o.volume > 0)
        .sort((a, b) => b.volume - a.volume)
        .slice(0, 2);
    
    highestVolumeOptions.forEach((option, index) => {
        optimal.push({
            ...option, 
            reason: `Highest Volume ${index === 0 ? '(#1)' : '(#2)'} - ${formatNumber(option.volume)} contracts`
        });
    });
    
    // Best overall Greeks-based options
    const bestOverall = [...scoredOptions]
        .filter(o => o.volume > 0 && o.bid > 0)
        .sort((a, b) => b.greeks_score - a.greeks_score)
        .slice(0, 1); // Reduced to 1 to make room for volume leaders
    
    bestOverall.forEach((option) => {
        optimal.push({
            ...option, 
            reason: `Best Greeks Score`
        });
    });
    
    // Highest volume by option type
    const calls = scoredOptions.filter(o => o.option_type === 'call' && o.volume > 0);
    const puts = scoredOptions.filter(o => o.option_type === 'put' && o.volume > 0);
    
    if (calls.length > 0) {
        const highestVolumeCall = calls.reduce((best, current) => 
            (current.volume > best.volume) ? current : best
        );
        optimal.push({
            ...highestVolumeCall, 
            reason: `Highest Volume Call - ${formatNumber(highestVolumeCall.volume)} contracts`
        });
    }
    
    if (puts.length > 0) {
        const highestVolumePut = puts.reduce((best, current) => 
            (current.volume > best.volume) ? current : best
        );
        optimal.push({
            ...highestVolumePut, 
            reason: `Highest Volume Put - ${formatNumber(highestVolumePut.volume)} contracts`
        });
    }
    
    // Best risk-reward ratio (time value vs days to expiry)
    const riskRewardOptions = scoredOptions.filter(o => 
        o.volume > 0 && o.days_to_expiry > 7 && o.time_value > 0
    );
    
    if (riskRewardOptions.length > 0) {
        const bestRiskReward = riskRewardOptions.reduce((best, current) => {
            const bestRatio = best.time_value / best.days_to_expiry;
            const currentRatio = current.time_value / current.days_to_expiry;
            return currentRatio < bestRatio ? current : best; // Lower is better (less time decay)
        });
        optimal.push({...bestRiskReward, reason: 'Best Risk/Reward'});
    }
    
    // Remove duplicates
    const uniqueOptimal = optimal.filter((contract, index, self) => 
        index === self.findIndex(c => c.symbol === contract.symbol)
    );
    
    return uniqueOptimal.slice(0, 4); // Limit to 4 recommendations
}

// Filter and display options
function filterAndDisplayOptions() {
    let filteredOptions = [...optionChains];
    
    // Apply filters
    const selectedExpiration = expirationFilter.value;
    const selectedType = optionTypeFilter.value;
    const selectedSort = sortBy.value;
    
    if (selectedExpiration) {
        filteredOptions = filteredOptions.filter(option => option.expiration_date === selectedExpiration);
    }
    
    if (selectedType) {
        filteredOptions = filteredOptions.filter(option => option.option_type === selectedType);
    }
    
    // Calculate Greeks scores for filtering if needed
    if (selectedSort === 'greeks_score') {
        const currentPrice = stockQuote?.last || 0;
        const outlook = marketOutlook.value || 'neutral';
        filteredOptions = filteredOptions.map(option => ({
            ...option,
            greeks_score: calculateGreeksScore(option, currentPrice, outlook)
        }));
    }
    
    // Sort options
    filteredOptions.sort((a, b) => {
        switch (selectedSort) {
            case 'greeks_score':
                return (b.greeks_score || 0) - (a.greeks_score || 0);
            case 'volume':
                return (b.volume || 0) - (a.volume || 0);
            case 'open_interest':
                return (b.open_interest || 0) - (a.open_interest || 0);
            case 'delta':
                return Math.abs(b.greeks?.delta || 0) - Math.abs(a.greeks?.delta || 0);
            case 'gamma':
                return (b.greeks?.gamma || 0) - (a.greeks?.gamma || 0);
            case 'theta':
                return Math.abs(a.greeks?.theta || 0) - Math.abs(b.greeks?.theta || 0); // Lower theta is better
            case 'vega':
                return (b.greeks?.vega || 0) - (a.greeks?.vega || 0);
            case 'strike':
                return a.strike - b.strike;
            case 'bid':
                return (b.bid || 0) - (a.bid || 0);
            default:
                return 0;
        }
    });
    
    displayOptionChains(filteredOptions);
}

// Display option chains table
function displayOptionChains(options) {
    const container = document.getElementById('optionChains');
    
    if (options.length === 0) {
        container.innerHTML = '<h3>Option Chains</h3><p>No options match the selected filters.</p>';
        return;
    }
    
    const table = `
        <h3>Option Chains (${options.length} contracts) - Enhanced with Greeks Analysis</h3>
        <div class="table-container">
            <table class="chains-table">
                <thead>
                    <tr>
                        <th>Symbol</th>
                        <th>Type</th>
                        <th>Strike</th>
                        <th>Expiry</th>
                        <th>Bid/Ask</th>
                        <th>Last</th>
                        <th>Delta</th>
                        <th>Gamma</th>
                        <th>Theta</th>
                        <th>Vega</th>
                        <th>IV</th>
                        <th>Volume</th>
                        <th>OI</th>
                        <th>Break-Even</th>
                        <th>Greeks Score</th>
                    </tr>
                </thead>
                <tbody>
                    ${options.map(option => {
                        const rowClass = option.option_type === 'call' ? 'call-row' : 'put-row';
                        const volumeClass = (option.volume || 0) > 100 ? 'high-volume' : '';
                        const superVolumeClass = (option.volume || 0) > 1000 ? 'super-volume' : '';
                        const oiClass = (option.open_interest || 0) > 1000 ? 'high-oi' : '';
                        const greeksClass = (option.greeks_score || 0) > 15 ? 'high-greeks' : '';
                        
                        return `
                            <tr class="${rowClass} ${volumeClass} ${superVolumeClass} ${oiClass} ${greeksClass}" title="Volume: ${formatNumber(option.volume) || 'N/A'} | Greeks Score: ${option.greeks_score?.toFixed(1) || 'N/A'}">
                                <td>${option.symbol}</td>
                                <td>
                                    <span class="option-type ${option.option_type}">
                                        ${option.option_type.toUpperCase()}
                                    </span>
                                </td>
                                <td>$${option.strike}</td>
                                <td>${formatDate(option.expiration_date)}</td>
                                <td>$${option.bid?.toFixed(2) || 'N/A'} / $${option.ask?.toFixed(2) || 'N/A'}</td>
                                <td>$${option.last?.toFixed(2) || 'N/A'}</td>
                                <td class="greek-cell">${option.greeks?.delta?.toFixed(3) || 'N/A'}</td>
                                <td class="greek-cell">${option.greeks?.gamma?.toFixed(4) || 'N/A'}</td>
                                <td class="greek-cell ${(option.greeks?.theta || 0) < -0.05 ? 'high-theta' : ''}">${option.greeks?.theta?.toFixed(3) || 'N/A'}</td>
                                <td class="greek-cell">${option.greeks?.vega?.toFixed(3) || 'N/A'}</td>
                                <td class="greek-cell iv-cell">${option.greeks?.impliedVol ? (option.greeks.impliedVol * 100).toFixed(1) + '%' : 'N/A'}</td>
                                <td class="volume-cell ${superVolumeClass ? 'super-volume-text' : volumeClass ? 'high-volume-text' : ''}">${formatNumber(option.volume) || 'N/A'}</td>
                                <td>${formatNumber(option.open_interest) || 'N/A'}</td>
                                <td>$${option.break_even?.toFixed(2) || 'N/A'}</td>
                                <td class="score-cell ${greeksClass}">${option.greeks_score?.toFixed(1) || 'N/A'}</td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>
    `;
    
    container.innerHTML = table;
}

// Utility functions
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric' 
    });
}

function formatNumber(num) {
    if (!num) return 'N/A';
    return num.toLocaleString();
}

function showLoading(show) {
    loadingOverlay.style.display = show ? 'block' : 'none';
    searchBtn.disabled = show;
    
    const btnText = searchBtn.querySelector('.btn-text');
    const loadingIcon = searchBtn.querySelector('.loading-icon');
    
    if (show) {
        btnText.style.display = 'none';
        loadingIcon.style.display = 'inline-block';
    } else {
        btnText.style.display = 'inline';
        loadingIcon.style.display = 'none';
    }
}

function showError(message) {
    errorMessage.style.display = 'block';
    document.getElementById('errorText').textContent = message;
    errorMessage.classList.add('fade-in');
    
    // Hide results sections
    filtersSection.style.display = 'none';
    resultsSection.style.display = 'none';
}

function hideError() {
    errorMessage.style.display = 'none';
}

// Add some additional CSS for option types and status indicators
const additionalStyles = `
<style>
.option-type.call {
    color: #28a745;
    font-weight: 600;
}

.option-type.put {
    color: #dc3545;
    font-weight: 600;
}

.positive {
    color: #28a745;
}

.negative {
    color: #dc3545;
}

.table-container {
    max-height: 600px;
    overflow-y: auto;
    overflow-x: auto;
    border-radius: 8px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
}

.chains-table {
    min-width: 1200px;
}

.chains-table th {
    position: sticky;
    top: 0;
    z-index: 10;
    white-space: nowrap;
    font-size: 0.85rem;
    padding: 10px 8px;
}

.chains-table td {
    white-space: nowrap;
    padding: 8px;
    font-size: 0.85rem;
}

.greek-cell {
    background-color: rgba(102, 126, 234, 0.05);
    font-family: 'Courier New', monospace !important;
}

.score-cell {
    background-color: rgba(40, 167, 69, 0.1);
    font-weight: bold !important;
}

.iv-cell {
    background-color: rgba(255, 193, 7, 0.1);
    font-weight: 600;
    color: #856404;
}

.super-volume {
    background-color: #ff6b6b !important;
    color: white !important;
    border-left: 4px solid #ee5a24 !important;
}

.super-volume-text {
    color: #ee5a24 !important;
    font-weight: 700 !important;
    background-color: rgba(238, 90, 36, 0.1) !important;
}

.high-volume-text {
    color: #fd7e14 !important;
    font-weight: 600 !important;
}

.volume-cell {
    text-align: center;
    font-family: 'Courier New', monospace;
}
</style>
`;

// Inject additional styles
document.head.insertAdjacentHTML('beforeend', additionalStyles);
