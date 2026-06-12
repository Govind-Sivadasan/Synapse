interface Props {
  title: string;
  description: string;
}

export default function PlaceholderPage({ title, description }: Props) {
  return (
    <div>
      <h2>{title}</h2>
      <div className="card">
        <p className="placeholder">{description}</p>
      </div>
    </div>
  );
}
