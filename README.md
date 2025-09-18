# Option Chain Lookup

A modern web application for looking up and analyzing stock option chains using the Tradier API. Find optimal option contracts with real-time market data and advanced filtering capabilities.

## Features

- **Real-time Stock Quotes**: Get current stock prices, volume, and bid/ask spreads
- **Comprehensive Option Chains**: View all available option contracts for any stock
- **Smart Recommendations**: AI-powered suggestions for optimal option contracts based on:
  - **Greeks Analysis**: Delta, Gamma, Theta, Vega scoring system
  - **Risk-Reward Ratios**: Time value vs. days to expiry analysis
  - **Market Outlook Integration**: Bullish, bearish, or neutral positioning
  - **Liquidity Factors**: Volume and open interest weighting
- **Advanced Filtering**: Filter by expiration date, option type (calls/puts), and sort by various criteria
- **Beautiful UI**: Modern, responsive design with intuitive user experience
- **Mobile Friendly**: Fully responsive design that works on all devices

## Quick Start

1. **Clone or Download** this repository
2. **Open `index.html`** in your web browser
3. **Enter a stock ticker** (e.g., AAPL, SPY, TSLA) and click "Search Options"
4. **Explore the results** with filtering and sorting options

## API Configuration

The application uses the Tradier API with the provided key. The API key is already configured in the `script.js` file:

```javascript
const TRADIER_API_KEY = 'SbankthvlFeRl2IMBNWUTO3JbKFM';
```

## CORS Considerations

Since this is a client-side application making API calls to Tradier, you may encounter CORS (Cross-Origin Resource Sharing) issues when running locally. Here are solutions:

### Option 1: Use a Local Server (Recommended)

Instead of opening the HTML file directly, serve it through a local web server:

**Using Python:**
```bash
# Python 3
python -m http.server 8000

# Python 2
python -m SimpleHTTPServer 8000
```

**Using Node.js (if you have it installed):**
```bash
npx http-server
```

**Using PHP:**
```bash
php -S localhost:8000
```

Then open `http://localhost:8000` in your browser.

### Option 2: Use a CORS Proxy (For Testing)

If you encounter CORS issues, you can temporarily use a CORS proxy by modifying the `TRADIER_BASE_URL` in `script.js`:

```javascript
// Temporary CORS proxy (for testing only)
const TRADIER_BASE_URL = 'https://cors-anywhere.herokuapp.com/https://api.tradier.com/v1';
```

**Note**: CORS proxies should only be used for development/testing. For production, implement a proper backend server.

## File Structure

```
optionlookup/
├── index.html          # Main HTML file with app structure
├── styles.css          # CSS styles and responsive design
├── script.js           # JavaScript application logic and API integration
└── README.md           # This file
```

## How It Works

1. **Stock Quote Lookup**: Fetches real-time stock data using Tradier's quotes endpoint
2. **Option Symbol Discovery**: Uses the options lookup endpoint to find all available option symbols
3. **Option Chain Retrieval**: Fetches detailed option chain data for multiple expiration dates
4. **Data Analysis**: Processes the data to identify optimal contracts based on volume, open interest, and moneyness
5. **Interactive Display**: Presents the data in an intuitive, filterable interface

## Key Features Explained

### Optimal Contract Recommendations

The app analyzes option chains and recommends contracts based on:

- **Highest Volume**: Options with the most trading activity
- **Near-the-Money**: Options close to the current stock price (within 5%)
- **Liquidity**: Options with high open interest for better execution

### Advanced Greeks Analysis

The application now includes sophisticated Greeks analysis using **official Tradier/ORATS data** to help identify the most ideal option contracts:

- **Delta Analysis**: Measures price sensitivity to underlying stock movement (from ORATS)
- **Gamma Analysis**: Tracks how quickly Delta changes (from ORATS)
- **Theta Analysis**: Evaluates time decay impact (from ORATS)
- **Vega Analysis**: Assesses volatility sensitivity (from ORATS)
- **Implied Volatility**: Real-time IV calculations (from ORATS)
- **Composite Scoring**: Combines all Greeks into a single actionable score

### Smart Filtering & Sorting

- **Expiration Dates**: Filter by specific expiration dates
- **Option Types**: View calls, puts, or both
- **Market Outlook**: Set bullish, bearish, or neutral bias for recommendations
- **Advanced Sorting**: Sort by Greeks score, Delta, Gamma, Theta, Vega, volume, open interest, strike price, or bid price

### Visual Indicators

- **Color Coding**: Green for calls, red for puts
- **Volume Highlighting**: High-volume options are highlighted
- **Open Interest**: High open interest options are marked

## Browser Compatibility

- Chrome/Edge: ✅ Fully supported
- Firefox: ✅ Fully supported
- Safari: ✅ Fully supported
- Mobile browsers: ✅ Responsive design

## API Rate Limits

The Tradier API has rate limits:
- Market data: 120 requests per minute
- The app is designed to be efficient and stay within these limits

## Troubleshooting

### Common Issues

1. **"Failed to fetch option data"**: 
   - Check your internet connection
   - Ensure the ticker symbol is valid
   - Try using a local server instead of opening the file directly

2. **"No option chains found"**: 
   - The stock may not have options available
   - Try a different, more liquid stock (e.g., SPY, AAPL, TSLA)

3. **CORS errors**: 
   - Use a local server as described above
   - Check browser console for specific error messages

### Debug Mode

Open browser Developer Tools (F12) and check the Console tab for detailed error messages and API responses.

## Customization

You can easily customize the app by modifying:

- **`styles.css`**: Change colors, fonts, and layout
- **`script.js`**: Modify filtering logic, add new features, or change API endpoints
- **`index.html`**: Update the UI structure or add new elements

## Security Note

The API key is embedded in the client-side code for demo purposes. In a production environment, you should:

1. Use environment variables
2. Implement a backend server to handle API calls
3. Never expose API keys in client-side code

## License

This project is open source and available under the MIT License.

## Support

For issues or questions:
1. Check the browser console for error messages
2. Verify your internet connection
3. Ensure you're using a supported browser
4. Try the troubleshooting steps above

---

**Powered by Tradier API** | Real-time market data for informed trading decisions
