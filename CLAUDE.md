# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

This project uses a simple static web server approach - no build tools or package.json:

```bash
# Start local development server
python3 -m http.server 5173
# Access at http://localhost:5173
```

## Architecture Overview

This is a minimal frontend application for displaying and filtering poker tournament data from a Google Sheets CSV. The architecture is deliberately simple:

### Core Components
- **index.html**: Main HTML structure with semantic header, controls, and table layout
- **app.js**: Main application logic (ES6 modules, vanilla JavaScript)
- **styles.css**: Responsive CSS with mobile-first card layout and desktop table view

### Data Flow
1. **CSV Fetching**: Uses PapaParse (CDN) to fetch and parse Google Sheets CSV
2. **Normalization**: Raw CSV data is normalized with date/time parsing and multiplier calculations
3. **State Management**: Simple global state object with raw data, normalized data, filtered results, and sort state
4. **Filtering**: Multiple filter types (area, multiplier range, title keywords, late registration status)
5. **Rendering**: Dynamic DOM updates with responsive table/card layouts

### Key Features
- **Responsive Design**: Desktop table view switches to mobile card layout at 768px
- **Real-time Filtering**: Area buttons (六本木, 渋谷, etc.), multiplier ranges (10x, 20x, 30x+), title keywords
- **Color-coded Multipliers**: Green (10-19x), orange (20-29x), purple (30x+)
- **Late Registration**: Automatically hides expired tournaments with toggle option
- **Sortable Columns**: Click headers to sort by date, time, fees, multipliers, etc.

### Data Structure
Expected CSV columns: `ID`, `shop_name`, `address`, `area`, `title`, `date`, `start_time`, `late_registration_time`, `entry_fee`, `add_on`, `prize_list`, `total_prize`, `guaranteed_amount`, `prize_text`, `link`

## File Structure
- All logic contained in 3 main files (no subdirectories or modules)
- External dependency: PapaParse CDN for CSV parsing
- Static assets served directly from root

## Development Notes
- No transpilation or bundling - uses native ES6 modules
- CSS uses custom properties for theming
- Mobile breakpoint: 768px (switches table to cards)
- Date/time parsing handles Japanese formats (YYYY/MM/DD HH:mm)
- Prize calculations parse various formats (万, 千, k, x2 multipliers)