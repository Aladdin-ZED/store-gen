import { Screen } from "@/components/admin/common/screen";
import { WizardSkeleton } from "@/components/generate/skeleton";

/** Streaming placeholder for the generator: its own heading and the photo step's layout. */
export default function Loading() {
  return (
    <Screen wide className="pb-24">
      <WizardSkeleton />
    </Screen>
  );
}
