interface DataCardProps {
  title: string
  value: string
  unit?: string
  footer?: string
  highlight?: 'normal' | 'warning' | 'critical'
}

export function DataCard({ title, value, unit, footer, highlight = 'normal' }: DataCardProps) {
  return (
    <div className={`data-card data-card--${highlight}`}>
      <div className="data-card__title">{title}</div>
      <div className="data-card__value">
        {value}
        {unit ? <span className="data-card__unit">{unit}</span> : null}
      </div>
      {footer ? <div className="data-card__footer">{footer}</div> : null}
    </div>
  )
}
