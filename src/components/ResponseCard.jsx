import './ResponseCard.css';

export default function ResponseCard({ response, isLoading, type = 'info' }) {
  if (!response && !isLoading) return null;

  return (
    <div className={`response-card response-card--${type}`} role="alert" aria-live="polite">
      {isLoading ? (
        <div className="response-card__loading">
          <div className="response-dots">
            <span className="response-dot"></span>
            <span className="response-dot"></span>
            <span className="response-dot"></span>
          </div>
          <span className="response-card__loading-text">Analyzing...</span>
        </div>
      ) : (
        <div className="response-card__content">
          <span className="response-card__icon">
            {type === 'scene' && '👁️'}
            {type === 'text' && '📖'}
            {type === 'currency' && '💵'}
            {type === 'color' && '🎨'}
            {type === 'objects' && '🪑'}
            {type === 'info' && '🧠'}
            {type === 'error' && '⚠️'}
          </span>
          <p className="response-card__text">{response}</p>
        </div>
      )}
    </div>
  );
}
