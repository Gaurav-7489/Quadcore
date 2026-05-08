import './ActionCard.css';

export default function ActionCard({ icon, title, description, onClick, variant = 'default', disabled = false }) {
  return (
    <button
      className={`action-card action-card--${variant} ${disabled ? 'action-card--disabled' : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={`${title}: ${description}`}
    >
      <span className="action-card__icon">{icon}</span>
      <div className="action-card__text">
        <span className="action-card__title">{title}</span>
        <span className="action-card__desc">{description}</span>
      </div>
      <span className="action-card__arrow">→</span>
    </button>
  );
}
