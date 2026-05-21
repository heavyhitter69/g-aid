"use client";

import { motion } from "framer-motion";
import { FEATURES } from "@/lib/data";
import { Brain, GitBranch, BarChart3, Activity, Cloud, Users } from "lucide-react";

const icons: Record<string, React.ElementType> = {
  brain: Brain, workflow: GitBranch, chart: BarChart3,
  activity: Activity, cloud: Cloud, users: Users,
};

export function Features() {
  return (
    <section id="features" className="relative py-24 px-6">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl md:text-4xl font-bold mb-4 text-primary">
            Enterprise <span className="text-primary">Capabilities</span>
          </h2>
          <p className="text-zinc-300 max-w-2xl mx-auto">
            Built for exploration teams, research institutions, and consulting firms
          </p>
        </motion.div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map((f, i) => {
            const Icon = icons[f.icon] || Brain;
            return (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                whileHover={{ y: -4 }}
                className="glass-panel rounded-xl p-6 border border-subtle hover:border-primary/20 transition-all duration-300 group"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/5 border border-subtle mb-4 transition-all group-hover:bg-primary/10">
                  <Icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold text-primary mb-2">{f.title}</h3>
                <p className="text-sm text-zinc-400">{f.description}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}


