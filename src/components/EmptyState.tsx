interface Props {
  icon?: string;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}

export function EmptyState({ icon = "💭", title, description, action }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-8 px-4 text-center space-y-2">
      <div className="text-4xl opacity-60 mb-1">{icon}</div>
      <p className="text-sm font-medium text-white/80">{title}</p>
      {description && (
        <p className="text-xs text-white/50 max-w-sm">{description}</p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="mt-2 px-3 py-1.5 text-xs bg-accent text-black rounded font-medium"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
