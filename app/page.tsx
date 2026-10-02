import Header from "@/components/Header";
import Hero from "@/components/Hero";
import SocialProof from "@/components/SocialProof";
import Results from "@/components/Results";
import Problem from "@/components/Problem";
import Benefits from "@/components/Benefits";
import ProductShowcase from "@/components/ProductShowcase";
import HowItWorks from "@/components/HowItWorks";
import Features from "@/components/Features";
import Testimonials from "@/components/Testimonials";
import Pricing from "@/components/Pricing";
import Faq from "@/components/Faq";
import FinalCta from "@/components/FinalCta";
import StickyCta from "@/components/StickyCta";
import Footer from "@/components/Footer";

export default function Page() {
  return (
    <>
      <Header />

      <main>
        <Hero />
        <SocialProof />
        <Results />
        <Problem />
        <Benefits />
        <ProductShowcase />
        <HowItWorks />
        <Features />
        <Testimonials />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>

      <div className="pb-16 md:pb-0">
        <Footer />
      </div>
      <StickyCta />
    </>
  );
}