import "./featured-plan-beam.css";

/** Decorative border only; the plan's content and controls remain unobstructed. */
export function FeaturedPlanBeam() {
  return (
    <div className="featured-plan-beam" aria-hidden="true">
      <span />
      <span />
    </div>
  );
}
