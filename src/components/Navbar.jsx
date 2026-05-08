import { NavLink } from 'react-router-dom';
import voiceService from '../services/voice';
import './Navbar.css';

const navItems = [
  { path: '/', icon: '🏠', label: 'Home', speech: 'Home' },
  { path: '/camera', icon: '📷', label: 'Camera', speech: 'Opening camera' },
  { path: '/sos', icon: '🚨', label: 'SOS', speech: 'Opening emergency' },
  { path: '/settings', icon: '⚙️', label: 'Settings', speech: 'Opening settings' },
];

export default function Navbar() {
  const handleNavClick = (item) => {
    voiceService.speak(item.speech);
  };

  return (
    <nav className="navbar" id="main-nav" role="navigation" aria-label="Main navigation">
      {navItems.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          className={({ isActive }) => `nav-item ${isActive ? 'nav-item--active' : ''}`}
          aria-label={item.label}
          onClick={() => handleNavClick(item)}
        >
          <span className="nav-icon">{item.icon}</span>
          <span className="nav-label">{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
